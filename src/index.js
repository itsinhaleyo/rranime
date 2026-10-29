require('dotenv').config();
const path = require('path'), crypto = require('crypto'), express = require('express'), session = require('express-session'), MySQLStore = require('express-mysql-session')(session), axios = require('axios'), passport = require('passport'), nodemailer = require('nodemailer'), vhost = require('vhost'), cron = require('node-cron');

let db;
(async () => {
    try {
        // Connect to Database
        db = require('./database/db');
        console.log("Connected to Database.");
    } catch (error) {
        console.log(`=-=DB-ERROR=-= ${error}`);
    }
})();

const mainweb = express(), rranime = express();
const port = process.env.PORT;
mainweb.set('view engine', 'ejs');
mainweb.set('views', path.join(__dirname, 'public', 'templates')); 
rranime.set('view engine', 'ejs');
rranime.set('views', path.join(__dirname, 'public', 'templates'));
mainweb.set('subdomain offset', 1);
mainweb.use(express.urlencoded({ extended: false }));
mainweb.use(express.json());
mainweb.use(express.static(path.join(__dirname, 'public')));
mainweb.set('trust proxy', 1);
rranime.set('trust proxy', 1);
rranime.use(express.urlencoded({ extended: false }));
rranime.use(express.json());
const sessionStore = new MySQLStore({}, db);
const sessionOptions = {
    key: 'rranime_session_cookie',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        secure: true
    }
};
rranime.use(session(sessionOptions));
rranime.use(passport.initialize());
rranime.use(passport.session());

const LocalStrategy = require('passport-local').Strategy;

passport.use(new LocalStrategy({
    usernameField: 'password',
    passwordField: 'password'
}, (username, password, done) => {
    if (password === process.env.USER_1) {
        const user = { id: 1, role: 'admin' };
        return done(null, user);
    } else if (password === process.env.USER_2) {
        const user = { id: 2, role: 'user' };
        console.log("User 2 Logged In.");
        return done(null, user);
    } else if (password === process.env.USER_3) {
        const user = { id: 3, role: 'user' };
        console.log("User 3 Logged In.");
        return done(null, user);
    } else {
        return done(null, false, { message: 'Invalid password' });
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    const user = { id: id, role: 'admin' };
    done(null, user);
});

function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

const activityRanks = [
    { name: 'Newbie', xp: 0 },
    { name: 'Side Character', xp: 1000 },
    { name: 'Casual Watcher', xp: 2500 },
    { name: 'Seasonal Viewer', xp: 10000 },
    { name: 'Certified Weeb', xp: 25000 },
    { name: 'Anime Veteran', xp: 50000 },
    { name: 'Anime Legend', xp: 100000 }
];

function getActivityRank(userId, totalXp) {
    const xp = Math.max(0, Number(totalXp) || 0);
    if (String(userId) === '1') {
        return { name: 'ADMIN', isAdmin: true, xp, progress: 100, nextRank: null, xpToNext: 0 };
    }
    let rankIndex = 0;
    for (let i = 1; i < activityRanks.length; i += 1) {
        if (xp >= activityRanks[i].xp) rankIndex = i;
        else break;
    }
    const currentRank = activityRanks[rankIndex];
    const nextRank = activityRanks[rankIndex + 1] || null;
    const progress = nextRank
        ? Math.min(100, Math.floor(((xp - currentRank.xp) / (nextRank.xp - currentRank.xp)) * 100))
        : 100;
    return {
        name: currentRank.name,
        isAdmin: false,
        xp,
        progress,
        nextRank: nextRank?.name || null,
        xpToNext: nextRank ? Math.max(0, nextRank.xp - xp) : 0,
        nextRankXp: nextRank?.xp || null
    };
}

const airingScheduleCache = new Map();
const AIRING_SCHEDULE_CACHE_TTL_MS = 5 * 60 * 1000;
const upcomingAnimeCache = new Map();
const UPCOMING_ANIME_CACHE_TTL_MS = 30 * 60 * 1000;
const watchRoomClients = new Map();

function sendWatchRoomEvent(roomId, eventName, payload) {
    const clients = watchRoomClients.get(roomId);
    if (!clients) return;
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients.values()) {
        try { client.response.write(message); } catch { /* disconnected clients are removed on close */ }
    }
}

function getWatchRoomPresence(roomId) {
    const clients = watchRoomClients.get(roomId);
    if (!clients) return [];
    const members = new Map();
    for (const client of clients.values()) members.set(client.userId, client.displayName);
    return Array.from(members, ([userId, displayName]) => ({ userId, displayName }));
}

function broadcastWatchRoomPresence(roomId) {
    sendWatchRoomEvent(roomId, 'presence', { members: getWatchRoomPresence(roomId) });
}

function getNextMALSeason(date) {
    const month = date.getMonth();
    if (month <= 1) return { year: date.getFullYear(), season: 'spring' };
    if (month <= 4) return { year: date.getFullYear(), season: 'summer' };
    if (month <= 7) return { year: date.getFullYear(), season: 'fall' };
    return { year: date.getFullYear() + 1, season: 'winter' };
}

rranime.get('/login', (req, res) => {
    res.render('login', {});
});

rranime.post('/login', passport.authenticate('local', {
    successRedirect: '/home',
    failureRedirect: '/login'
}));

rranime.get('/profile', checkAuthenticated, async (req, res) => {
    try {
        await ensureUserXpReady();
        const [rows] = await db.execute(
            `SELECT display_name, bio, avatar_url, accent_color
             FROM user_profiles WHERE user_id = ?`,
            [String(req.user.id)]
        );
        const profile = rows[0] || {
            display_name: '',
            bio: '',
            avatar_url: '',
            accent_color: '#ff3c20'
        };
        const [xpRows] = await db.execute(
            'SELECT xp FROM user_xp_totals WHERE user_id = ?',
            [String(req.user.id)]
        );
        const activityRank = getActivityRank(req.user.id, xpRows[0]?.xp || 0);
        res.render('profile', { profile, activityRank, saved: req.query.saved === '1' });
    } catch (err) {
        console.error('Error loading user profile:', err);
        res.status(500).send('Unable to load your profile.');
    }
});

rranime.post('/profile', checkAuthenticated, async (req, res) => {
    const displayName = String(req.body.display_name || '').trim();
    const bio = String(req.body.bio || '').trim();
    const avatarUrl = String(req.body.avatar_url || '').trim();
    const accentColor = String(req.body.accent_color || '').trim();

    if (displayName.length > 40 || bio.length > 280 || avatarUrl.length > 500) {
        return res.status(400).send('Profile fields exceed their allowed lengths.');
    }
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        return res.status(400).send('Avatar URL must start with http:// or https://.');
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
        return res.status(400).send('Choose a valid accent color.');
    }
    try {
        await db.execute(
            `INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, accent_color)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name),
                bio = VALUES(bio),
                avatar_url = VALUES(avatar_url),
                accent_color = VALUES(accent_color)`,
            [String(req.user.id), displayName, bio, avatarUrl, accentColor]
        );
        res.redirect('/profile?saved=1');
    } catch (err) {
        console.error('Error saving user profile:', err);
        res.status(500).send('Unable to save your profile.');
    }
});

rranime.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/login');
    });
});

rranime.get('/', checkAuthenticated, async (req, res) => {
    try {
        const [trendingTags] = await db.query(
            `SELECT mal_id, title, english_title, japanese_title
             FROM mal_anime
             WHERE status = 'currently_airing'
               AND (rating IS NULL OR rating != 'rx')
             ORDER BY COALESCE(score, 0) DESC
             LIMIT 4`
        );
        const [airingAnime] = await db.query(
            `SELECT mal_id, title, english_title, japanese_title, type, episodes, score, image_url
             FROM mal_anime
             WHERE status = 'currently_airing'
               AND (rating IS NULL OR rating != 'rx')
             ORDER BY COALESCE(score, 0) DESC
             LIMIT 6`
        );
        await ensureUserXpReady();
        const [recentComments] = await db.execute(`
            SELECT c.comment_id, c.parent_comment_id, c.body, c.created_at,
                   c.anime_id, c.episode_number, a.title AS anime_title, a.english_title, a.japanese_title,
                   c.user_id, p.display_name, p.avatar_url, p.accent_color,
                   COALESCE(xp.xp, 0) AS xp
            FROM episode_comments c
            INNER JOIN mal_anime a ON a.mal_id = c.anime_id
            LEFT JOIN user_profiles p ON p.user_id = c.user_id
            LEFT JOIN user_xp_totals xp ON xp.user_id = c.user_id
            ORDER BY c.created_at DESC, c.comment_id DESC
            LIMIT 5
        `);
        recentComments.forEach(comment => {
            comment.activityRank = getActivityRank(comment.user_id, comment.xp);
        });
        res.render('landing', { 
            trending: trendingTags,
            airingAnime,
            recentComments
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading RRA: " + err.message);
    }
});

rranime.get('/home', checkAuthenticated, async (req, res) => {
    try {
        const [spotlight] = await db.query(
            `SELECT mal_id, title, english_title, japanese_title, type, episodes, score, synopsis, image_url 
             FROM mal_anime 
             WHERE type = 'TV' AND status = 'currently_airing'
               AND (rating IS NULL OR rating != 'rx')
             ORDER BY COALESCE(score, 0) DESC LIMIT 5`
        );
        const [latestEpisodes] = await db.query(
            `SELECT mal_id, title, english_title, japanese_title, type, episodes, image_url 
             FROM mal_anime 
             WHERE status = 'currently_airing' and rating != 'rx'
             ORDER BY last_updated DESC LIMIT 15`
        );
        const [sidebarTopAnime] = await db.query(
            `SELECT mal_id, title, english_title, japanese_title, type, score, image_url 
             FROM mal_anime 
             ORDER BY score DESC LIMIT 10`
        );
        const [airingAnime] = await db.execute(`
            SELECT mal_id, title, english_title, japanese_title, type, episodes, score, image_url 
            FROM mal_anime 
            WHERE status = 'currently_airing' and rating != 'rx'
            ORDER BY score DESC
            LIMIT 12
        `);
        const [continueWatching] = await db.execute(`
            SELECT w.anime_id, w.episode_number, w.position_seconds, w.duration_seconds,
                   w.provider, w.audio, w.watched_at,
                   a.title, a.english_title, a.japanese_title, a.image_url
            FROM user_watched_episodes w
            INNER JOIN mal_anime a ON a.mal_id = w.anime_id
            WHERE w.user_id = ? AND w.is_completed = FALSE
              AND (w.duration_seconds <= 0 OR w.position_seconds < w.duration_seconds - 30)
              AND NOT EXISTS (
                  SELECT 1
                  FROM user_watched_episodes newer
                  WHERE newer.user_id = w.user_id AND newer.anime_id = w.anime_id
                    AND (newer.watched_at > w.watched_at
                         OR (newer.watched_at = w.watched_at AND newer.episode_number > w.episode_number))
              )
            ORDER BY w.watched_at DESC
            LIMIT 6
        `, [String(req.user.id)]);
        await ensureUserXpReady();
        const [recentComments] = await db.execute(`
            SELECT c.comment_id, c.parent_comment_id, c.body, c.created_at,
                   c.anime_id, c.episode_number, a.title AS anime_title, a.english_title, a.japanese_title,
                   c.user_id, p.display_name, p.avatar_url, p.accent_color,
                   COALESCE(xp.xp, 0) AS xp
            FROM episode_comments c
            INNER JOIN mal_anime a ON a.mal_id = c.anime_id
            LEFT JOIN user_profiles p ON p.user_id = c.user_id
            LEFT JOIN user_xp_totals xp ON xp.user_id = c.user_id
            ORDER BY c.created_at DESC, c.comment_id DESC
            LIMIT 5
        `);
        recentComments.forEach(comment => {
            comment.activityRank = getActivityRank(comment.user_id, comment.xp);
        });
        try {
            await refreshAiringSchedule('sub');
        } catch (scheduleRefreshError) {
            console.warn('Could not refresh home estimated schedule; using saved entries:', scheduleRefreshError.message);
        }
        const scheduleToday = new Date();
        const scheduleStart = new Date(scheduleToday);
        scheduleStart.setHours(0, 0, 0, 0);
        const scheduleEnd = new Date(scheduleStart);
        scheduleEnd.setDate(scheduleEnd.getDate() + 7);
        const [homeScheduleRows] = await db.execute(`
            SELECT mal_id, title, japanese_title, episode, airing_at
            FROM airing_schedule_entries
            WHERE schedule_type = 'sub' AND airing_at >= ? AND airing_at < ?
            ORDER BY airing_at ASC
        `, [Math.floor(scheduleStart.getTime() / 1000), Math.floor(scheduleEnd.getTime() / 1000)]);
        const dateKey = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const estimatedSchedule = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(scheduleStart);
            date.setDate(date.getDate() + index);
            return {
                key: dateKey(date),
                day: date.toLocaleDateString('en-US', { weekday: 'short' }),
                dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                isToday: index === 0,
                releases: []
            };
        });
        const scheduleByDate = new Map(estimatedSchedule.map(day => [day.key, day]));
        homeScheduleRows.forEach(row => {
            const airingDate = new Date(Number(row.airing_at) * 1000);
            const day = scheduleByDate.get(dateKey(airingDate));
            if (!day) return;
            day.releases.push({
                mal_id: row.mal_id,
                title: row.title,
                japanese_title: row.japanese_title || row.title,
                episode: row.episode,
                time: airingDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            });
        });
        res.render('home', {
            airingAnime: airingAnime,
            continueWatching,
            spotlightAnime: spotlight,
            latestAnime: latestEpisodes,
            sidebarAnime: sidebarTopAnime,
            recentComments,
            estimatedSchedule
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading RRA home page: " + err.message);
    }
});

rranime.get('/continue-watching', checkAuthenticated, async (req, res) => {
    try {
        const [continueWatching] = await db.execute(`
            SELECT w.anime_id, w.episode_number, w.position_seconds, w.duration_seconds,
                   w.provider, w.audio, w.watched_at,
                   a.title, a.english_title, a.japanese_title, a.image_url
            FROM user_watched_episodes w
            INNER JOIN mal_anime a ON a.mal_id = w.anime_id
            WHERE w.user_id = ? AND w.is_completed = FALSE
              AND (w.duration_seconds <= 0 OR w.position_seconds < w.duration_seconds - 30)
              AND NOT EXISTS (
                  SELECT 1
                  FROM user_watched_episodes newer
                  WHERE newer.user_id = w.user_id AND newer.anime_id = w.anime_id
                    AND (newer.watched_at > w.watched_at
                         OR (newer.watched_at = w.watched_at AND newer.episode_number > w.episode_number))
              )
            ORDER BY w.watched_at DESC
            LIMIT 50
        `, [String(req.user.id)]);
        res.render('continue-watching', { continueWatching });
    } catch (error) {
        console.error('Could not load Continue Watching:', error);
        res.status(500).send('Unable to load your Continue Watching list.');
    }
});

rranime.get('/anime/:animeid', checkAuthenticated, async (req, res) => {
    try {
        const animeId = req.params.animeid;
        const activeUserId = req.user.id;
        const [rows] = await db.query(
            `SELECT a.mal_id, a.title, a.english_title, a.japanese_title, a.type, a.episodes, a.status, a.score, a.synopsis, a.image_url, a.rating,
                    GROUP_CONCAT(g.genre_name SEPARATOR ', ') AS genres
             FROM mal_anime a
             LEFT JOIN anime_genres_mapping ag ON a.mal_id = ag.anime_id
             LEFT JOIN mal_genres g ON ag.genre_id = g.genre_id
             WHERE a.mal_id = ?
             GROUP BY a.mal_id`, [animeId]
        );
        if (rows.length === 0) return res.status(404).send("Anime Title Not Found");
        let animeDetails = rows[0];
        if (!animeDetails.episodes || animeDetails.episodes === 0 || animeDetails.status === 'currently_airing') {
            const anilistData = await fetchEpisodesFromAniList(animeDetails.mal_id);
            if (anilistData && anilistData.episodes > 0) {
                animeDetails.episodes = anilistData.episodes;
                await db.query(
                    `UPDATE mal_anime SET episodes = ? WHERE mal_id = ?`,
                    [anilistData.episodes, animeDetails.mal_id]
                );
            } else if (!animeDetails.episodes) {
                animeDetails.episodes = 12; 
            }
        }
        const [watchlistCheck] = await db.query(
            `SELECT 1 FROM user_watchlist WHERE user_id = ? AND anime_id = ?`,
            [activeUserId, animeId]
        );
        const isSavedInWatchlist = watchlistCheck.length > 0;
        const [watchedEpisodeRows] = await db.execute(`
            SELECT episode_number
            FROM user_watched_episodes
            WHERE user_id = ? AND anime_id = ?
        `, [activeUserId, animeId]);
        const [recommendedAnime] = await db.query(
            `SELECT mal_id, title, english_title, japanese_title, type, score, image_url 
             FROM mal_anime 
             WHERE mal_id != ? AND type = ?
             ORDER BY score DESC LIMIT 5`, [animeId, animeDetails.type]
        );
        let sequels = [];
        let prequels = [];
        try {
            const relatedRelations = await fetchAnimeRelationsFromAniList(animeDetails.mal_id);
            if (relatedRelations.length) {
                const relatedMalIds = relatedRelations.map(item => item.malId);
                const [cataloguedAnime] = await db.query(
                    `SELECT mal_id, title, english_title, japanese_title, type, score, image_url
                     FROM mal_anime WHERE mal_id IN (?)`, [relatedMalIds]
                );
                const catalogById = new Map(cataloguedAnime.map(item => [Number(item.mal_id), item]));
                const resolvedRelations = relatedRelations.map(relation => {
                    const catalogItem = catalogById.get(relation.malId);
                    return catalogItem
                        ? { ...relation, ...catalogItem, mal_id: relation.malId, isCatalogued: true }
                        : { ...relation, mal_id: relation.malId, isCatalogued: false };
                });
                sequels = resolvedRelations.filter(relation => relation.relationType === 'SEQUEL');
                prequels = resolvedRelations.filter(relation => relation.relationType === 'PREQUEL');
            }
        } catch (error) {
            console.warn(`Could not load sequel relations for MAL ID ${animeDetails.mal_id}:`, error.message);
        }
        res.render('view', {
            anime: animeDetails,
            recommendations: recommendedAnime,
            sequels,
            prequels,
            inWatchlist: isSavedInWatchlist,
            watchedEpisodes: watchedEpisodeRows.map(row => Number(row.episode_number))
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

rranime.get('/anime/:animeid/:episode', checkAuthenticated, async (req, res) => {
    try {
        const animeId = req.params.animeid;
        const currentEp = parseInt(req.params.episode) || 1;
        const [animeRows] = await db.query(
            `SELECT a.mal_id, a.title, a.english_title, a.japanese_title, a.status, a.type,
                    a.episodes, a.image_url, a.score, a.synopsis, a.rating,
                    (SELECT GROUP_CONCAT(g.genre_name ORDER BY g.genre_name SEPARATOR ', ')
                     FROM anime_genres_mapping ag
                     INNER JOIN mal_genres g ON g.genre_id = ag.genre_id
                     WHERE ag.anime_id = a.mal_id) AS genres
             FROM mal_anime a
             WHERE a.mal_id = ?`, [animeId]
        );
        if (animeRows.length === 0) {
            return res.status(404).send("Anime Profile Index Record Not Found.");
        }
        const animeDetails = animeRows[0];
        const anilistData = await fetchEpisodesFromAniList(animeDetails.mal_id);
        if (!animeDetails.episodes || animeDetails.episodes === 0 || animeDetails.status === 'currently_airing') {
            if (anilistData && anilistData.episodes > 0) {
                animeDetails.episodes = anilistData.episodes;
                await db.query(
                    `UPDATE mal_anime SET episodes = ? WHERE mal_id = ?`,
                    [anilistData.episodes, animeDetails.mal_id]
                );
            } else if (!animeDetails.episodes) {
                animeDetails.episodes = 12; 
            }
        }
        const totalEpisodesCount = animeDetails.episodes || 12;
        const selectedAudio = req.query.audio === 'dub' ? 'dub' : 'sub';
        const autoPlayNext = req.query.autoplay === '1';
        const allowedProviders = ['zoko', 'anixo', 'megavid'];
        let selectedProvider = allowedProviders.includes(req.query.provider) ? req.query.provider : 'zoko';
        if (selectedProvider === 'anixo' && !anilistData?.anilistId) selectedProvider = 'zoko';
        const malId = animeDetails.mal_id;
        const anilistId = anilistData ? anilistData.anilistId : null;
        let initialStreamUrl;
        if (selectedProvider === 'anixo') {
            initialStreamUrl = `https://anixo.buzz/embed/ani/${encodeURIComponent(anilistId)}/${encodeURIComponent(currentEp)}/${selectedAudio}?color=%23e63946`;
        } else if (selectedProvider === 'megavid') {
            const sourceType = malId ? 'mal' : 'ani';
            const sourceId = malId || anilistId;
            initialStreamUrl = `https://megavid.buzz/${sourceType}/${encodeURIComponent(sourceId)}/${encodeURIComponent(currentEp)}/${selectedAudio}?color=%23e63946&autoplay=true`;
        } else {
            initialStreamUrl = `https://zokoanime.video/stream/mal/${encodeURIComponent(malId)}/${encodeURIComponent(currentEp)}/${selectedAudio}?color=ff3c20${autoPlayNext ? '&autoplay=true' : ''}`;
        }
        let resumePosition = 0;
        if (currentEp >= 1 && currentEp <= totalEpisodesCount) {
            const [watchInsert] = await db.execute(`
                INSERT IGNORE INTO user_watched_episodes (user_id, anime_id, episode_number, provider, audio)
                VALUES (?, ?, ?, ?, ?)
            `, [req.user.id, animeDetails.mal_id, currentEp, selectedProvider, selectedAudio]);
            await db.execute(`
                UPDATE user_watched_episodes SET provider = ?, audio = ?
                WHERE user_id = ? AND anime_id = ? AND episode_number = ?
            `, [selectedProvider, selectedAudio, String(req.user.id), animeDetails.mal_id, currentEp]);
            const [progressRows] = await db.execute(`
                SELECT position_seconds, is_completed
                FROM user_watched_episodes
                WHERE user_id = ? AND anime_id = ? AND episode_number = ?
            `, [String(req.user.id), animeDetails.mal_id, currentEp]);
            if (req.query.resume === '1' && selectedProvider === 'zoko' && !progressRows[0]?.is_completed) {
                resumePosition = Number(progressRows[0]?.position_seconds) || 0;
            }
            if (watchInsert.affectedRows > 0) {
                await awardActivityXpSafely(req.user.id, 'watch', `${animeDetails.mal_id}:${currentEp}`, 10, 5);
            }
        }
        await ensureUserXpReady();
        const [watchedEpisodeRows] = await db.execute(`
            SELECT episode_number
            FROM user_watched_episodes
            WHERE user_id = ? AND anime_id = ?
        `, [req.user.id, animeDetails.mal_id]);
        const [commentRows] = await db.execute(`
            SELECT c.comment_id, c.parent_comment_id, c.user_id, c.body, c.created_at,
                   p.display_name, p.avatar_url, p.accent_color,
                   COALESCE(xp.xp, 0) AS xp
            FROM episode_comments c
            LEFT JOIN user_profiles p ON p.user_id = c.user_id
            LEFT JOIN user_xp_totals xp ON xp.user_id = c.user_id
            WHERE c.anime_id = ? AND c.episode_number = ?
            ORDER BY c.created_at ASC, c.comment_id ASC
        `, [animeDetails.mal_id, currentEp]);
        commentRows.forEach(comment => {
            comment.activityRank = getActivityRank(comment.user_id, comment.xp);
        });
        const commentById = new Map(commentRows.map(comment => [String(comment.comment_id), { ...comment, replies: [] }]));
        const topLevelComments = [];
        for (const comment of commentById.values()) {
            if (comment.parent_comment_id && commentById.has(String(comment.parent_comment_id))) {
                commentById.get(String(comment.parent_comment_id)).replies.push(comment);
            } else if (!comment.parent_comment_id) {
                topLevelComments.push(comment);
            }
        }
        const [currentProfileRows] = await db.execute(`
            SELECT display_name, avatar_url FROM user_profiles WHERE user_id = ?
        `, [String(req.user.id)]);
        let nextAiring = null;
        if (animeDetails.status === 'currently_airing') {
            try {
                const scheduleAnime = await getAiringSchedule(selectedAudio);
                const scheduledTitle = scheduleAnime.find(item => Number(item.idMal) === Number(malId));
                const nowTimestamp = Math.floor(Date.now() / 1000);
                const nextScheduleNode = (scheduledTitle?.airingSchedule?.nodes || [])
                    .filter(node => Number(node.airingAt) > nowTimestamp && Number(node.airingAt) > 0)
                    .sort((left, right) => Number(left.airingAt) - Number(right.airingAt))[0];
                if (nextScheduleNode) {
                    nextAiring = {
                        episode: nextScheduleNode.episode,
                        airingAt: Number(nextScheduleNode.airingAt)
                    };
                }
            } catch (scheduleError) {
                console.warn(`Could not load ${selectedAudio} episode schedule for MAL ${malId}:`, scheduleError.message);
            }

            // AniList is a useful fallback when a sub schedule entry is missing from the feed.
            if (!nextAiring && selectedAudio === 'sub'
                && anilistData?.status === 'RELEASING'
                && Number.isFinite(Number(anilistData.nextAiringAt))
                && Number(anilistData.nextAiringAt) > 0) {
                nextAiring = {
                    episode: anilistData.nextAiringEpisode,
                    airingAt: Number(anilistData.nextAiringAt)
                };
            }
        }
        res.render('watch', {
            anime: animeDetails,
            currentEpisode: currentEp,
            totalEpisodes: totalEpisodesCount,
            selectedProvider,
            selectedAudio,
            resumePosition,
            initialStreamUrl,
            nextAiring,
            watchedEpisodes: watchedEpisodeRows.map(row => Number(row.episode_number)),
            anilistId,
            comments: topLevelComments,
            commentCount: commentRows.length,
            currentUserId: String(req.user.id),
            currentProfile: currentProfileRows[0] || { display_name: '', avatar_url: '' }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error compiling video theater streaming canvas: " + err.message);
    }
});

rranime.post('/api/watch-progress', checkAuthenticated, async (req, res) => {
    const animeId = Number(req.body.animeId);
    const episode = Number(req.body.episode);
    const position = Number(req.body.position);
    const duration = Number(req.body.duration);
    const provider = ['zoko', 'anixo', 'megavid'].includes(req.body.provider) ? req.body.provider : null;
    const audio = ['sub', 'dub'].includes(req.body.audio) ? req.body.audio : null;
    const completed = req.body.completed === true;
    if (!Number.isSafeInteger(animeId) || animeId < 1 || !Number.isSafeInteger(episode) || episode < 1
        || !Number.isFinite(position) || position < 0 || position > 21600
        || !Number.isFinite(duration) || duration < 0 || duration > 21600 || !provider || !audio) {
        return res.status(400).json({ error: 'Invalid episode progress.' });
    }
    try {
        const [result] = await db.execute(`
            UPDATE user_watched_episodes
            SET position_seconds = ?, duration_seconds = ?, provider = ?, audio = ?,
                is_completed = IF(? = 1, TRUE, is_completed), watched_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND anime_id = ? AND episode_number = ?
        `, [position, duration, provider, audio, completed ? 1 : 0, String(req.user.id), animeId, episode]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Episode history was not found.' });
        res.json({ ok: true });
    } catch (error) {
        console.error('Could not save episode progress:', error);
        res.status(500).json({ error: 'Unable to save episode progress.' });
    }
});

rranime.post('/anime/:animeid/:episode/comments', checkAuthenticated, async (req, res) => {
    const animeId = Number(req.params.animeid);
    const episodeNumber = Number(req.params.episode);
    const body = String(req.body.body || '').trim();
    if (!Number.isSafeInteger(animeId) || animeId < 1 || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1) {
        return res.status(400).send('Invalid anime or episode.');
    }
    if (!body || body.length > 1000) {
        return res.status(400).send('Comments must be between 1 and 1000 characters.');
    }
    try {
        const [animeRows] = await db.execute('SELECT mal_id FROM mal_anime WHERE mal_id = ?', [animeId]);
        if (!animeRows.length) return res.status(404).send('Anime not found.');
        const [commentInsert] = await db.execute(`
            INSERT INTO episode_comments (user_id, anime_id, episode_number, body)
            VALUES (?, ?, ?, ?)
        `, [String(req.user.id), animeId, episodeNumber, body]);
        await awardActivityXpSafely(req.user.id, 'comment', commentInsert.insertId, 5, 5);
        res.redirect(`/anime/${animeId}/${episodeNumber}#comments`);
    } catch (err) {
        console.error('Error posting episode comment:', err);
        res.status(500).send('Unable to post your comment.');
    }
});

rranime.post('/anime/:animeid/:episode/comments/:commentId/reply', checkAuthenticated, async (req, res) => {
    const animeId = Number(req.params.animeid);
    const episodeNumber = Number(req.params.episode);
    const parentCommentId = Number(req.params.commentId);
    const userId = String(req.user.id);
    const body = String(req.body.body || '').trim();
    if (!Number.isSafeInteger(animeId) || animeId < 1 || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1 || !Number.isSafeInteger(parentCommentId) || parentCommentId < 1) {
        return res.status(400).send('Invalid reply reference.');
    }
    if (!body || body.length > 1000) {
        return res.status(400).send('Replies must be between 1 and 1000 characters.');
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [parentRows] = await connection.execute(`
            SELECT comment_id, user_id FROM episode_comments
            WHERE comment_id = ? AND anime_id = ? AND episode_number = ? AND parent_comment_id IS NULL
            FOR UPDATE
        `, [parentCommentId, animeId, episodeNumber]);
        if (!parentRows.length) {
            await connection.rollback();
            return res.status(404).send('Comment not found for this episode.');
        }
        const [result] = await connection.execute(`
            INSERT INTO episode_comments (user_id, anime_id, episode_number, parent_comment_id, body)
            VALUES (?, ?, ?, ?, ?)
        `, [userId, animeId, episodeNumber, parentCommentId, body]);
        const recipientUserId = String(parentRows[0].user_id);
        if (recipientUserId !== userId) {
            await connection.execute(`
                INSERT INTO comment_notifications
                    (recipient_user_id, actor_user_id, comment_id, anime_id, episode_number)
                VALUES (?, ?, ?, ?, ?)
            `, [recipientUserId, userId, result.insertId, animeId, episodeNumber]);
        }
        await connection.commit();
        await awardActivityXpSafely(userId, 'comment', result.insertId, 5, 5);
        res.redirect(`/anime/${animeId}/${episodeNumber}#comment-${parentCommentId}`);
    } catch (err) {
        await connection.rollback();
        console.error('Error posting episode reply:', err);
        res.status(500).send('Unable to post your reply.');
    } finally {
        connection.release();
    }
});

rranime.post('/anime/:animeid/:episode/comments/:commentId/delete', checkAuthenticated, async (req, res) => {
    const animeId = Number(req.params.animeid);
    const episodeNumber = Number(req.params.episode);
    const commentId = Number(req.params.commentId);
    if (!Number.isSafeInteger(animeId) || animeId < 1 || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1 || !Number.isSafeInteger(commentId) || commentId < 1) {
        return res.status(400).send('Invalid comment reference.');
    }
    try {
        await db.execute(`
            DELETE FROM episode_comments
            WHERE comment_id = ? AND user_id = ? AND anime_id = ? AND episode_number = ?
        `, [commentId, String(req.user.id), animeId, episodeNumber]);
        res.redirect(`/anime/${animeId}/${episodeNumber}#comments`);
    } catch (err) {
        console.error('Error deleting episode comment:', err);
        res.status(500).send('Unable to delete your comment.');
    }
});

rranime.get('/watch2gether', checkAuthenticated, async (req, res) => {
    try {
        const [rooms] = await db.execute(`
            SELECT r.room_id, r.anime_id, r.anime_title, r.current_episode, r.audio,
                   r.updated_at, p.display_name AS host_display_name
            FROM watch_rooms r
            LEFT JOIN user_profiles p ON p.user_id = r.host_user_id
            ORDER BY r.updated_at DESC
            LIMIT 50
        `);
        res.render('watch-rooms', { rooms });
    } catch (error) {
        console.error('Could not load watch rooms:', error);
        res.status(500).send('Unable to load watch rooms.');
    }
});

rranime.post('/watch2gether/create', checkAuthenticated, async (req, res) => {
    const animeId = Number(req.body.anime_id);
    const episode = Number(req.body.episode);
    const audio = req.body.audio === 'dub' ? 'dub' : 'sub';
    if (!Number.isSafeInteger(animeId) || animeId < 1 || !Number.isSafeInteger(episode) || episode < 1) {
        return res.status(400).send('Choose a valid anime episode to create a room.');
    }
    try {
        const [animeRows] = await db.execute(
            'SELECT mal_id, title, english_title, episodes, status FROM mal_anime WHERE mal_id = ?',
            [animeId]
        );
        if (!animeRows.length) return res.status(404).send('Anime not found.');
        const anime = animeRows[0];
        let anilist = null;
        try { anilist = await fetchEpisodesFromAniList(animeId); } catch { /* MyAnimeList values remain a fallback */ }
        const totalEpisodes = Number(anilist?.episodes) > 0
            ? Number(anilist.episodes)
            : (Number(anime.episodes) > 0 ? Number(anime.episodes) : 0);
        const seriesFinished = anime.status === 'finished_airing' || anilist?.status === 'FINISHED';
        if (seriesFinished && totalEpisodes > 0 && episode > totalEpisodes) {
            return res.status(400).send('That episode is outside the known episode count.');
        }
        const roomId = crypto.randomBytes(9).toString('base64url');
        await db.execute(`
            INSERT INTO watch_rooms
                (room_id, host_user_id, anime_id, anime_title, current_episode, total_episodes, series_finished, audio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [roomId, String(req.user.id), animeId, anime.english_title || anime.title, episode, totalEpisodes, seriesFinished, audio]);
        res.redirect(`/watch2gether/${roomId}/episode/${episode}`);
    } catch (error) {
        console.error('Could not create watch room:', error);
        res.status(500).send('Unable to create the watch room.');
    }
});

rranime.get(['/watch2gether/:roomId', '/watch2gether/:roomId/episode/:episode'], checkAuthenticated, async (req, res) => {
    try {
        const [roomRows] = await db.execute('SELECT * FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        if (!roomRows.length) return res.status(404).send('This watch room has ended or does not exist.');
        await ensureUserXpReady();
        const room = roomRows[0];
        const canonicalRoomUrl = `/watch2gether/${encodeURIComponent(room.room_id)}/episode/${Number(room.current_episode)}`;
        if (Number(req.params.episode) !== Number(room.current_episode)) {
            return res.redirect(302, canonicalRoomUrl);
        }
        const [messageRows] = await db.execute(`
            SELECT m.message_id, m.user_id, m.display_name, m.body, m.created_at,
                   COALESCE(x.xp, 0) AS activity_xp
            FROM watch_room_messages m
            LEFT JOIN user_xp_totals x ON x.user_id = m.user_id
            WHERE m.room_id = ?
            ORDER BY m.message_id DESC LIMIT 50
        `, [room.room_id]);
        const [profileRows] = await db.execute(
            'SELECT display_name FROM user_profiles WHERE user_id = ?',
            [String(req.user.id)]
        );
        const [animeRows] = await db.execute(
            `SELECT a.mal_id, a.title, a.english_title, a.japanese_title, a.image_url,
                    a.type, a.episodes, a.status, a.score, a.synopsis, a.rating,
                    (SELECT GROUP_CONCAT(g.genre_name ORDER BY g.genre_name SEPARATOR ', ')
                     FROM anime_genres_mapping ag
                     INNER JOIN mal_genres g ON g.genre_id = ag.genre_id
                     WHERE ag.anime_id = a.mal_id) AS genres
             FROM mal_anime a WHERE a.mal_id = ?`,
            [room.anime_id]
        );
        const anime = animeRows[0] || {
            mal_id: room.anime_id,
            title: room.anime_title,
            english_title: room.anime_title,
            japanese_title: room.anime_title,
            image_url: '',
            episodes: room.total_episodes
        };
        res.render('watch-room', {
            room,
            anime,
            messages: messageRows.reverse().map(message => ({
                ...message,
                activityRank: getActivityRank(message.user_id, message.activity_xp)
            })),
            currentUserId: String(req.user.id),
            currentUserName: profileRows[0]?.display_name || `Anime fan #${req.user.id}`,
            isHost: String(room.host_user_id) === String(req.user.id)
        });
    } catch (error) {
        console.error('Could not open watch room:', error);
        res.status(500).send('Unable to open the watch room.');
    }
});

rranime.get('/api/watch-rooms/:roomId/events', checkAuthenticated, async (req, res) => {
    try {
        const [roomRows] = await db.execute('SELECT * FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        if (!roomRows.length) return res.status(404).end();
        const room = roomRows[0];
        const [profileRows] = await db.execute(
            'SELECT display_name FROM user_profiles WHERE user_id = ?',
            [String(req.user.id)]
        );
        const client = {
            response: res,
            userId: String(req.user.id),
            displayName: profileRows[0]?.display_name || `Anime fan #${req.user.id}`
        };
        res.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.flushHeaders();
        res.write(`event: room\ndata: ${JSON.stringify({
            roomId: room.room_id,
            animeId: room.anime_id,
            title: room.anime_title,
            hostUserId: String(room.host_user_id),
            currentEpisode: Number(room.current_episode),
            totalEpisodes: Number(room.total_episodes),
            seriesFinished: Boolean(room.series_finished),
            audio: room.audio,
            position: Number(room.position_seconds),
            paused: Boolean(room.is_paused),
            host: String(room.host_user_id) === String(req.user.id)
        })}\n\n`);
        if (!watchRoomClients.has(room.room_id)) watchRoomClients.set(room.room_id, new Map());
        const clients = watchRoomClients.get(room.room_id);
        const clientId = crypto.randomBytes(8).toString('hex');
        client.id = clientId;
        clients.set(clientId, client);
        broadcastWatchRoomPresence(room.room_id);
        const heartbeat = setInterval(() => {
            if (!res.writableEnded) res.write(': ping\n\n');
        }, 20000);
        req.on('close', () => {
            clearInterval(heartbeat);
            clients.delete(clientId);
            if (!clients.size) watchRoomClients.delete(room.room_id);
            else broadcastWatchRoomPresence(room.room_id);
        });
    } catch (error) {
        console.error('Could not connect to watch room:', error);
        if (!res.headersSent) res.status(500).end();
        else res.end();
    }
});

rranime.post('/api/watch-rooms/:roomId/messages', checkAuthenticated, async (req, res) => {
    const body = String(req.body.body || '').trim();
    if (!body || body.length > 500) return res.status(400).json({ error: 'Messages must be 1 to 500 characters.' });
    try {
        const [rooms] = await db.execute('SELECT room_id FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        if (!rooms.length) return res.status(404).json({ error: 'This room has ended.' });
        await ensureUserXpReady();
        const [profileRows] = await db.execute(
            'SELECT display_name FROM user_profiles WHERE user_id = ?',
            [String(req.user.id)]
        );
        const displayName = profileRows[0]?.display_name || `Anime fan #${req.user.id}`;
        const [xpRows] = await db.execute('SELECT xp FROM user_xp_totals WHERE user_id = ?', [String(req.user.id)]);
        const [result] = await db.execute(`
            INSERT INTO watch_room_messages (room_id, user_id, display_name, body)
            VALUES (?, ?, ?, ?)
        `, [req.params.roomId, String(req.user.id), displayName, body]);
        const message = {
            messageId: String(result.insertId),
            userId: String(req.user.id),
            displayName,
            activityRank: getActivityRank(req.user.id, xpRows[0]?.xp || 0),
            body,
            createdAt: new Date().toISOString()
        };
        sendWatchRoomEvent(req.params.roomId, 'chat', message);
        res.json({ ok: true, message });
    } catch (error) {
        console.error('Could not post watch room message:', error);
        res.status(500).json({ error: 'Unable to send your message.' });
    }
});

rranime.post('/api/watch-rooms/:roomId/state', checkAuthenticated, async (req, res) => {
    const position = Number(req.body.position);
    const paused = Boolean(req.body.paused);
    if (!Number.isFinite(position) || position < 0 || position > 21600) {
        return res.status(400).json({ error: 'Invalid playback position.' });
    }
    try {
        const [rooms] = await db.execute('SELECT host_user_id FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        if (!rooms.length) return res.status(404).json({ error: 'This room has ended.' });
        if (String(rooms[0].host_user_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only the room host controls synced playback.' });
        }
        const sentAt = Date.now();
        await db.execute(`
            UPDATE watch_rooms SET position_seconds = ?, is_paused = ? WHERE room_id = ?
        `, [position, paused, req.params.roomId]);
        const state = { position, paused, sentAt };
        sendWatchRoomEvent(req.params.roomId, 'state', state);
        res.json({ ok: true });
    } catch (error) {
        console.error('Could not update watch room playback:', error);
        res.status(500).json({ error: 'Unable to sync room playback.' });
    }
});

rranime.post('/api/watch-rooms/:roomId/audio', checkAuthenticated, async (req, res) => {
    const audio = req.body.audio === 'dub' ? 'dub' : req.body.audio === 'sub' ? 'sub' : null;
    const position = Number(req.body.position);
    const paused = Boolean(req.body.paused);
    if (!audio || !Number.isFinite(position) || position < 0 || position > 21600) {
        return res.status(400).json({ error: 'Choose a valid audio track.' });
    }
    try {
        const [rooms] = await db.execute('SELECT host_user_id FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        if (!rooms.length) return res.status(404).json({ error: 'This room has ended.' });
        if (String(rooms[0].host_user_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only the room host can change the room audio.' });
        }
        const [roomState] = await db.execute('SELECT current_episode FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        if (!roomState.length) return res.status(404).json({ error: 'This room has ended.' });
        await db.execute(`
            UPDATE watch_rooms
            SET audio = ?, position_seconds = ?, is_paused = ?
            WHERE room_id = ?
        `, [audio, position, paused, req.params.roomId]);
        sendWatchRoomEvent(req.params.roomId, 'audio', {
            audio,
            position,
            paused,
            episode: Number(roomState[0].current_episode),
            sentAt: Date.now()
        });
        res.json({ ok: true, audio });
    } catch (error) {
        console.error('Could not change watch room audio:', error);
        res.status(500).json({ error: 'Unable to change room audio.' });
    }
});

rranime.post('/api/watch-rooms/:roomId/advance', checkAuthenticated, async (req, res) => {
    try {
        const [rooms] = await db.execute('SELECT * FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        if (!rooms.length) return res.status(404).json({ error: 'This room has ended.' });
        const room = rooms[0];
        if (String(room.host_user_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only the room host can advance episodes.' });
        }
        let seriesFinished = Boolean(room.series_finished);
        let totalEpisodes = Number(room.total_episodes) || 0;
        const [animeRows] = await db.execute('SELECT status, episodes FROM mal_anime WHERE mal_id = ?', [room.anime_id]);
        if (animeRows[0]?.status === 'finished_airing') {
            seriesFinished = true;
            totalEpisodes = Number(animeRows[0].episodes) || totalEpisodes;
        }
        if (!seriesFinished && (totalEpisodes === 0 || Number(room.current_episode) >= totalEpisodes)) {
            try {
                const anilist = await fetchEpisodesFromAniList(room.anime_id);
                if (anilist?.status === 'FINISHED') {
                    seriesFinished = true;
                    totalEpisodes = Number(anilist.episodes) || totalEpisodes;
                }
            } catch { /* retain the last saved series status when AniList is unavailable */ }
        }
        if (seriesFinished && totalEpisodes !== Number(room.total_episodes)) {
            await db.execute('UPDATE watch_rooms SET series_finished = TRUE, total_episodes = ? WHERE room_id = ?', [totalEpisodes, room.room_id]);
        } else if (seriesFinished && !room.series_finished) {
            await db.execute('UPDATE watch_rooms SET series_finished = TRUE WHERE room_id = ?', [room.room_id]);
        }
        if (seriesFinished && totalEpisodes > 0 && Number(room.current_episode) >= totalEpisodes) {
            const [deleteResult] = await db.execute(
                'DELETE FROM watch_rooms WHERE room_id = ? AND current_episode = ?',
                [room.room_id, room.current_episode]
            );
            if (deleteResult.affectedRows) {
                sendWatchRoomEvent(room.room_id, 'closed', { reason: 'The final episode ended.' });
                return res.json({ ended: true });
            }
            const [latestRoom] = await db.execute('SELECT current_episode FROM watch_rooms WHERE room_id = ?', [room.room_id]);
            return res.json({ ended: false, episode: Number(latestRoom[0]?.current_episode || room.current_episode) });
        }
        const nextEpisode = Number(room.current_episode) + 1;
        const [advanceResult] = await db.execute(`
            UPDATE watch_rooms
            SET current_episode = ?, position_seconds = 0, is_paused = FALSE
            WHERE room_id = ? AND current_episode = ?
        `, [nextEpisode, room.room_id, room.current_episode]);
        if (!advanceResult.affectedRows) {
            const [latestRoom] = await db.execute('SELECT current_episode FROM watch_rooms WHERE room_id = ?', [room.room_id]);
            return res.json({ ended: false, episode: Number(latestRoom[0]?.current_episode || room.current_episode) });
        }
        sendWatchRoomEvent(room.room_id, 'episode', {
            episode: nextEpisode,
            position: 0,
            paused: false,
            sentAt: Date.now()
        });
        res.json({ ended: false, episode: nextEpisode });
    } catch (error) {
        console.error('Could not advance watch room episode:', error);
        res.status(500).json({ error: 'Unable to advance the room.' });
    }
});

rranime.post('/api/watch-rooms/:roomId/episode', checkAuthenticated, async (req, res) => {
    const targetEpisode = Number(req.body.episode);
    if (!Number.isSafeInteger(targetEpisode) || targetEpisode < 1) {
        return res.status(400).json({ error: 'Choose a valid episode.' });
    }
    try {
        const [rooms] = await db.execute('SELECT * FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        if (!rooms.length) return res.status(404).json({ error: 'This room has ended.' });
        const room = rooms[0];
        if (String(room.host_user_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only the room host can change episodes.' });
        }
        const currentEpisode = Number(room.current_episode);
        const totalEpisodes = Number(room.total_episodes) || 0;
        if (targetEpisode === currentEpisode) return res.json({ ok: true, episode: currentEpisode });
        if (targetEpisode > currentEpisode + 1 || targetEpisode < currentEpisode - 1) {
            return res.status(400).json({ error: 'Use the previous or next episode button.' });
        }
        if (targetEpisode > currentEpisode && totalEpisodes > 0 && targetEpisode > totalEpisodes) {
            return res.status(409).json({ error: 'This is the last known episode.' });
        }
        const [update] = await db.execute(`
            UPDATE watch_rooms
            SET current_episode = ?, position_seconds = 0, is_paused = FALSE
            WHERE room_id = ? AND current_episode = ?
        `, [targetEpisode, room.room_id, currentEpisode]);
        if (!update.affectedRows) {
            const [latest] = await db.execute('SELECT current_episode FROM watch_rooms WHERE room_id = ?', [room.room_id]);
            return res.status(409).json({ error: `The room is already on episode ${Number(latest[0]?.current_episode || currentEpisode)}.` });
        }
        sendWatchRoomEvent(room.room_id, 'episode', {
            episode: targetEpisode,
            position: 0,
            paused: false,
            sentAt: Date.now()
        });
        res.json({ ok: true, episode: targetEpisode });
    } catch (error) {
        console.error('Could not change watch room episode:', error);
        res.status(500).json({ error: 'Unable to change the room episode.' });
    }
});

rranime.post('/api/watch-rooms/:roomId/end', checkAuthenticated, async (req, res) => {
    try {
        const [rooms] = await db.execute('SELECT host_user_id FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        if (!rooms.length) return res.json({ ok: true });
        if (String(rooms[0].host_user_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only the room host can end the room.' });
        }
        await db.execute('DELETE FROM watch_rooms WHERE room_id = ?', [req.params.roomId]);
        sendWatchRoomEvent(req.params.roomId, 'closed', { reason: 'The host ended the room.' });
        res.json({ ok: true });
    } catch (error) {
        console.error('Could not end watch room:', error);
        res.status(500).json({ error: 'Unable to end the room.' });
    }
});

rranime.get('/airing', checkAuthenticated, async (req, res) => {
    try {
        const [airingAnime] = await db.execute(`
            SELECT mal_id, title, english_title, japanese_title, type, episodes, score, image_url, rating
            FROM mal_anime 
            WHERE status = 'currently_airing' and rating != 'rx'
            ORDER BY last_updated DESC
        `);
        res.render('airing', { 
            animeList: airingAnime,
            Data: { title: "Currently Airing", title2: `<h2><i class="fas fa-clock"></i> Latest Updated</h2>`, icon: `fa-satellite-dish` }
        });
    } catch (err) {
        console.error("Error loading currently airing anime page:", err);
        res.status(500).send("Server Error loading airing schedules.");
    }
});

rranime.get('/upcoming', checkAuthenticated, async (req, res) => {
    const nextSeason = getNextMALSeason(new Date());
    try {
        const animeList = await fetchUpcomingMALSeason(nextSeason.year, nextSeason.season);
        res.render('upcoming', {
            animeList,
            seasonLabel: `${nextSeason.season[0].toUpperCase()}${nextSeason.season.slice(1)} ${nextSeason.year}`,
            loadError: null
        });
    } catch (error) {
        console.error('Could not load upcoming anime from MyAnimeList:', error.message);
        res.status(error.statusCode || 502).render('upcoming', {
            animeList: [],
            seasonLabel: `${nextSeason.season[0].toUpperCase()}${nextSeason.season.slice(1)} ${nextSeason.year}`,
            loadError: process.env.MAL_ID || process.env.MAL_CLIENT_ID
                ? 'MyAnimeList could not provide the upcoming season right now. Please try again later.'
                : 'Set MAL_ID in the server environment to load upcoming anime.'
        });
    }
});

rranime.get('/airingschedule/:type', checkAuthenticated, async (req, res) => {
    try {
        const now = new Date();
        const scheduleType = String(req.params.type).toLowerCase();
        if (!['sub', 'dub'].includes(scheduleType)) {
            return res.status(404).send('Schedule type not found.');
        }
        const windowStartDate = new Date(now);
        windowStartDate.setHours(0, 0, 0, 0);
        const windowStart = Math.floor(windowStartDate.getTime() / 1000);
        const windowEndDate = new Date(now);
        windowEndDate.setHours(0, 0, 0, 0);
        windowEndDate.setDate(windowEndDate.getDate() + 7);
        const windowEnd = Math.floor(windowEndDate.getTime() / 1000);
        try {
            await refreshAiringSchedule(scheduleType);
        } catch (refreshError) {
            console.warn(`Could not refresh ${scheduleType} schedule; using saved entries:`, refreshError.message);
        }
        const [scheduleRows] = await db.execute(`
            SELECT mal_id, title, japanese_title, image_url, episode, airing_at
            FROM airing_schedule_entries
            WHERE schedule_type = ? AND airing_at >= ? AND airing_at < ?
            ORDER BY airing_at ASC
        `, [scheduleType, windowStart, windowEnd]);
        const calendar = {
            Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
        };
        const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDayName = weekDays[now.getDay()];
        const dayDates = Object.fromEntries(weekDays.map((day, index) => {
            const daysAhead = (index - now.getDay() + 7) % 7;
            const date = new Date(windowStartDate);
            date.setDate(date.getDate() + daysAhead);
            return [day, date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })];
        }));
        scheduleRows.forEach(row => {
            const airDate = new Date(Number(row.airing_at) * 1000);
            const dayName = weekDays[airDate.getDay()];
            const timeString = airDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            calendar[dayName].push({
                mal_id: row.mal_id,
                title: row.title,
                japanese_title: row.japanese_title || row.title,
                image_url: row.image_url,
                episode: row.episode,
                airTime: timeString,
                rawTimestamp: Number(row.airing_at)
            });
        });
        for (const day in calendar) {
            calendar[day].sort((a, b) => a.rawTimestamp - b.rawTimestamp);
        }
        res.render('airingschedule', {
            schedule: calendar,
            today: currentDayName,
            dayDates
        });
    } catch (err) {
        console.error("Airing schedule generation pipeline error:", err);
        res.status(500).send("Failed to parse remote streaming timetable channels: " + err.message);
    }
});

rranime.get('/trending', checkAuthenticated, async (req, res) => {
    try {
        const [airingAnime] = await db.execute(`
            SELECT mal_id, title, english_title, japanese_title, type, episodes, score, image_url 
            FROM mal_anime 
            WHERE status = 'currently_airing' and rating != 'rx'
            ORDER BY score DESC
        `);
        res.render('airing', { 
            animeList: airingAnime,
            Data: { title: "Trending Anime", title2: '', icon: `fa-arrow-trend-up` }
        });
    } catch (err) {
        console.error("Error loading currently trending anime page:", err);
        res.status(500).send("Server Error loading trending.");
    }
});

rranime.get('/hentai', checkAuthenticated, async (req, res) => {
    try {
        const [airingAnime] = await db.execute(`
            SELECT mal_id, title, english_title, japanese_title, type, episodes, score, image_url 
            FROM mal_anime 
            WHERE rating = 'rx'
            ORDER BY last_updated DESC
        `);
        res.render('airing', { 
            animeList: airingAnime,
            Data: { title: "Hentai", title2: '', icon: `fa-arrow-trend-up` }
        });
    } catch (err) {
        console.error("Error loading currently hentai page:", err);
        res.status(500).send("Server Error loading trending.");
    }
});

rranime.get('/genres/:genreId', checkAuthenticated, async (req, res) => {
    try {
        const genreId = req.params.genreId;
        const [genreMeta] = await db.execute(
            `SELECT genre_name FROM mal_genres WHERE genre_id = ?`, 
            [genreId]
        );
        if (genreMeta.length === 0) {
            return res.status(404).send("Genre Not Found");
        }
        const currentGenreName = genreMeta[0].genre_name;
        const [genreAnime] = await db.execute(`
            SELECT a.mal_id, a.title, a.english_title, a.japanese_title, a.type, a.episodes, a.score, a.image_url, a.rating
            FROM mal_anime a
            JOIN anime_genres_mapping ag ON a.mal_id = ag.anime_id
            WHERE ag.genre_id = ? AND a.rating != 'rx'
            ORDER BY a.score DESC, a.last_updated DESC
        `, [genreId]);
        res.render('airing', { 
            animeList: genreAnime,
            Data: { 
                title: ` ${currentGenreName} Anime`, 
                title2: ``, 
                icon: `fa-tv` 
            }
        });
    } catch (err) {
        console.error(`Error loading genre ID ${req.params.genreId}:`, err);
        res.status(500).send("Server Error loading genre listing.");
    }
});

rranime.get('/genres', checkAuthenticated, async (req, res) => {
    try {
        const [allGenres] = await db.execute(`
            SELECT g.genre_id, g.genre_name, COUNT(ag.anime_id) as total_shows
            FROM mal_genres g
            LEFT JOIN anime_genres_mapping ag ON g.genre_id = ag.genre_id
            GROUP BY g.genre_id
            HAVING total_shows > 0
            ORDER BY g.genre_name ASC
        `);
        res.render('genres', { 
            genres: allGenres,
            Data: { title: "Browse by Genre" }
        });
    } catch (err) {
        console.error("Error loading master genre index:", err);
        res.status(500).send("Server Error loading genre index directory.");
    }
});

rranime.get('/search', checkAuthenticated, async (req, res) => {
    try {
        const searchQuery = req.query.keyword || '';
        if (!searchQuery.trim()) {
            return res.redirect('/home');
        }
        const [results] = await db.query(
            `SELECT mal_id, title, english_title, japanese_title, type, episodes, score, image_url 
             FROM mal_anime 
             WHERE title LIKE ? OR english_title LIKE ? OR japanese_title LIKE ?
             ORDER BY score DESC LIMIT 36`, 
            [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`]
        );
        res.render('searchresults', {
            searchKeyword: searchQuery,
            animeResults: results
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error searching rranime index catalog: " + err.message);
    }
});

rranime.get('/watchlist', checkAuthenticated, async (req, res) => {
    try {
        const activeUserId = req.user && req.user.id ? req.user.id : "admin";
        const [watchlistAnime] = await db.query(`
            SELECT a.mal_id, a.title, a.english_title, a.japanese_title, a.type, a.episodes, a.score, a.image_url, a.status
            FROM mal_anime a
            INNER JOIN user_watchlist w ON a.mal_id = w.anime_id
            WHERE w.user_id = ?
            ORDER BY last_updated DESC
        `, [activeUserId]);
        const [sidebarTopAnime] = await db.query(`
            SELECT mal_id, title, english_title, japanese_title, type, score, image_url 
            FROM mal_anime 
            ORDER BY score DESC LIMIT 10
        `);
        res.render('watchlist', {
            watchlistAnime: watchlistAnime,
            sidebarAnime: sidebarTopAnime
        });
    } catch (err) {
        console.error("Watchlist lookup engine exception error:", err);
        res.status(500).send("Error compiling custom layout grid values: " + err.message);
    }
});

rranime.post('/watchlist/add', checkAuthenticated, async (req, res) => {
    try {
        console.log("=== WATCHLIST ADD BODY PAYLOAD ===", req.body);
        const { animeId } = req.body;
        const activeUserId = req.user.id;
        if (!animeId) {
            return res.status(400).send("Missing field parameter constraint indicators.");
        }
        const [result] = await db.execute(`
            INSERT INTO user_watchlist (user_id, anime_id)
            VALUES (?, ?)
        `, [activeUserId, animeId]);
        res.redirect(`/anime/${animeId}`);
    } catch (err) {
        console.error("Database connection exception error inside watchlist add loop:", err);
        res.status(500).send("Failed to save relationship tracking changes to database map: " + err.message);
    }
});

rranime.post('/watchlist/remove/:animeid', checkAuthenticated, async (req, res) => {
    try {
        const animeId = req.params.animeid;
        const activeUserId = req.user.id;
        await db.execute(`
            DELETE FROM user_watchlist 
            WHERE user_id = ? AND anime_id = ?
        `, [activeUserId, animeId]);
        const refererUrl = req.get('Referer');
        if (refererUrl) {
            res.redirect(refererUrl);
        } else {
            res.redirect('/watchlist');
        }

    } catch (err) {
        console.error("Database structural validation failure during user removal loop:", err);
        res.status(500).send("Failed to modify user selection collection records.");
    }
});

rranime.post('/watchlist/import-mal', checkAuthenticated, async (req, res) => {
    try {
        const { malUsername } = req.body;
        const activeUserId = req.user.id;
        if (!malUsername) {
            return res.status(400).send("MyAnimeList target user account identifier parameter missing.");
        }
        let currentUrl = `https://api.myanimelist.net/v2/users/${malUsername}/animelist?limit=1000`;
        let totalImportedCount = 0;
        let keepFetching = true;
        console.log(`Starting paginated watchlist sync for MAL profile name: ${malUsername}`);
        while (keepFetching) {
            console.log(`Fetching from endpoint vector: ${currentUrl}`);
            const response = await fetch(currentUrl, {
                method: 'GET',
                headers: {
                    'X-MAL-CLIENT-ID': process.env.MAL_ID,
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) {
                const errorPayload = await response.text();
                console.error(`MAL Sync API page step responded with non-200 state [${response.status}]: ${errorPayload}`);
                break; 
            }
            const payload = await response.json();
            const malListRecords = payload.data || [];
            if (malListRecords.length === 0) {
                break;
            }
            for (const item of malListRecords) {
                const malId = item.node ? item.node.id : null;
                if (!malId) continue;
                const [animeCheck] = await db.query(`SELECT mal_id FROM mal_anime WHERE mal_id = ?`, [malId]);
                if (animeCheck.length > 0) {
                    await db.execute(`
                        INSERT IGNORE INTO user_watchlist (user_id, anime_id)
                        VALUES (?, ?)
                    `, [activeUserId, malId]);
                    totalImportedCount++;
                }
            }
            if (payload.paging && payload.paging.next) {
                currentUrl = payload.paging.next;
            } else {
                keepFetching = false;
            }
        }
        if (totalImportedCount === 0) {
            return res.redirect('/watchlist?status=no_records_found');
        }
        console.log(`Successfully sync-imported ${totalImportedCount} matching database rows from MAL username: ${malUsername}`);
        res.redirect('/watchlist?status=import_success');
    } catch (err) {
        console.error("Critical synchronization tracking system failure exception:", err);
        res.status(500).send("Error compiling cross-network sync arrays: " + err.message);
    }
});

rranime.get('/notifications', checkAuthenticated, async (req, res) => {
    try {
        const [notifications] = await db.execute(`
            SELECT id, notification_type, anime_id, episode_number, title, message, is_read, created_at, comment_id
            FROM (
                SELECT id, 'episode' AS notification_type, anime_id, episode_number, title, message, is_read, created_at, NULL AS comment_id
                FROM aninotify WHERE user_id = ?
                UNION ALL
                SELECT n.notification_id AS id, 'comment' AS notification_type, n.anime_id, n.episode_number,
                       'New reply to your comment' AS title,
                       CONCAT(COALESCE(NULLIF(p.display_name, ''), CONCAT('Anime fan #', n.actor_user_id)), ' replied to your comment.') AS message,
                       n.is_read, n.created_at, n.comment_id
                FROM comment_notifications n
                LEFT JOIN user_profiles p ON p.user_id = n.actor_user_id
                WHERE n.recipient_user_id = ?
            ) AS all_notifications
            ORDER BY created_at DESC
            LIMIT 200
        `, [String(req.user.id), String(req.user.id)]);
        res.render('notifications', { notifications });
    } catch (err) {
        console.error('Error loading notifications:', err);
        res.status(500).send('Could not load notifications.');
    }
});

rranime.post('/notifications/comments/:id/read', checkAuthenticated, async (req, res) => {
    try {
        await db.execute(`UPDATE comment_notifications SET is_read = 1 WHERE notification_id = ? AND recipient_user_id = ?`, [req.params.id, String(req.user.id)]);
        res.redirect('/notifications');
    } catch (err) {
        console.error('Error marking reply notification as read:', err);
        res.status(500).send('Could not update this notification.');
    }
});

rranime.post('/notifications/comments/:id/delete', checkAuthenticated, async (req, res) => {
    try {
        await db.execute(`DELETE FROM comment_notifications WHERE notification_id = ? AND recipient_user_id = ?`, [req.params.id, String(req.user.id)]);
        res.redirect('/notifications');
    } catch (err) {
        console.error('Error deleting reply notification:', err);
        res.status(500).send('Could not delete this notification.');
    }
});

rranime.post('/notifications/:id/read', checkAuthenticated, async (req, res) => {
    try {
        await db.execute(`
            UPDATE aninotify
            SET is_read = 1
            WHERE id = ? AND user_id = ?
        `, [req.params.id, req.user.id]);
        res.redirect('/notifications');
    } catch (err) {
        console.error('Error marking notification as read:', err);
        res.status(500).send('Could not update this notification.');
    }
});

rranime.post('/notifications/:id/delete', checkAuthenticated, async (req, res) => {
    try {
        await db.execute(`
            DELETE FROM aninotify
            WHERE id = ? AND user_id = ?
        `, [req.params.id, req.user.id]);
        res.redirect('/notifications');
    } catch (err) {
        console.error('Error deleting notification:', err);
        res.status(500).send('Could not delete this notification.');
    }
});

rranime.get('/api/notifications/preview', checkAuthenticated, async (req, res) => {
    try {
        const [notifications] = await db.execute(`
            SELECT id, notification_type, anime_id, episode_number, title, message, is_read, created_at, comment_id
            FROM (
                SELECT id, 'episode' AS notification_type, anime_id, episode_number, title, message, is_read, created_at, NULL AS comment_id
                FROM aninotify WHERE user_id = ?
                UNION ALL
                SELECT n.notification_id AS id, 'comment' AS notification_type, n.anime_id, n.episode_number,
                       'New reply to your comment' AS title,
                       CONCAT(COALESCE(NULLIF(p.display_name, ''), CONCAT('Anime fan #', n.actor_user_id)), ' replied to your comment.') AS message,
                       n.is_read, n.created_at, n.comment_id
                FROM comment_notifications n
                LEFT JOIN user_profiles p ON p.user_id = n.actor_user_id
                WHERE n.recipient_user_id = ?
            ) AS all_notifications
            ORDER BY created_at DESC
            LIMIT 5
        `, [String(req.user.id), String(req.user.id)]);
        const [[{ unreadCount }]] = await db.execute(`
            SELECT
                (SELECT COUNT(*) FROM aninotify WHERE user_id = ? AND is_read = 0) +
                (SELECT COUNT(*) FROM comment_notifications WHERE recipient_user_id = ? AND is_read = 0) AS unreadCount
        `, [String(req.user.id), String(req.user.id)]);
        res.json({ notifications, unreadCount });
    } catch (err) {
        console.error('Error loading notification preview:', err);
        res.status(500).json({ error: 'Could not load notifications.' });
    }
});

rranime.get('/api/anime-suggestions', checkAuthenticated, async (req, res) => {
    const query = req.query.q;
    if (!query || query.length < 2) return res.json([]);
    try {
        const sql = `
            SELECT mal_id, title, english_title, japanese_title, type, score, image_url 
            FROM mal_anime 
            WHERE title LIKE ? OR english_title LIKE ? OR japanese_title LIKE ?
            ORDER BY COALESCE(score, 0) DESC
            LIMIT 5
        `;
        const searchTerm = `%${query}%`;
        const [results] = await db.execute(sql, [searchTerm, searchTerm, searchTerm]);
        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database query failed' });
    }
});

rranime.get('/*any', (req, res) => { res.redirect('/home'); });

mainweb.use(vhost(`rranime.online`, rranime));
mainweb.listen(port, () => { console.log(`Website running on PORT:${port}/`); });

async function fetchAndSaveAllMALAnime() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    try {
        let offset = 0;
        const limit = 500;
        let downloading = true;
        console.log(`Starting Official MAL Sync. Resuming from record offset: ${offset}`);
        while (downloading) {
            const malClientId = process.env.MAL_ID;
            if (!malClientId) {
                console.error("MAL client ID is missing. Set MAL_ID or MAL_CLIENT_ID in your environment.");
                break;
            }
            const url = `https://api.myanimelist.net/v2/anime/ranking?ranking_type=all&limit=${limit}&offset=${offset}&fields=alternative_titles,media_type,num_episodes,status,rating,mean,synopsis,genres`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-MAL-CLIENT-ID': malClientId,
                    'Accept': 'application/json'
                }
            });
            if (response.status === 429) {
                console.log("MAL Rate limit hit! Sleeping for 10 seconds...");
                await sleep(10000);
                continue;
            }
            if (response.status === 400) {
                const errorText = await response.text();
                console.error(`MAL API rejected the request (400). Paging may have reached its limit depth. Response: ${errorText}`);
                break;
            }
            if (!response.ok) {
                console.error(`MAL API Error: Status ${response.status}. Shutting down worker step.`);
                break;
            }
            const payload = await response.json();
            const edgeList = payload.data || [];
            if (edgeList.length === 0) {
                console.log("Database perfectly synced! No more records found.");
                break;
            }
            for (const edge of edgeList) {
                const node = edge.node;
                if (!node) continue;
                const insertAnimeSql = `
                    INSERT INTO mal_anime (mal_id, title, english_title, japanese_title, type, episodes, status, score, rating, synopsis, image_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        title = VALUES(title),
                        english_title = VALUES(english_title),
                        japanese_title = VALUES(japanese_title),
                        type = VALUES(type),
                        episodes = VALUES(episodes),
                        status = VALUES(status),
                        score = VALUES(score),
                        rating = VALUES(rating),
                        synopsis = VALUES(synopsis),
                        image_url = VALUES(image_url);
                `;
                const malId = node.id;
                const title = node.title;
                const englishTitle = node.alternative_titles?.en || null;
                const japaneseTitle = node.alternative_titles?.ja || null;
                const type = node.media_type || null;
                const episodes = node.num_episodes || null;
                const status = node.status || null;
                const score = node.mean || null;
                const rating = node.rating || null;
                const synopsis = node.synopsis || null;
                const imageUrl = node.main_picture?.large || node.main_picture?.medium || null;
                await db.query(insertAnimeSql, [
                    malId, title, englishTitle, japaneseTitle, type, episodes, status, score, rating, synopsis, imageUrl
                ]);
                const apiGenres = node.genres || [];
                if (apiGenres.length > 0) {
                    for (const genreItem of apiGenres) {
                        const genreId = genreItem.id;
                        const genreName = genreItem.name;
                        const insertGenreSql = `
                            INSERT INTO mal_genres (genre_id, genre_name)
                            VALUES (?, ?)
                            ON DUPLICATE KEY UPDATE genre_name = VALUES(genre_name);
                        `;
                        await db.query(insertGenreSql, [genreId, genreName]);
                        const insertMappingSql = `
                            INSERT IGNORE INTO anime_genres_mapping (anime_id, genre_id)
                            VALUES (?, ?);
                        `;
                        await db.query(insertMappingSql, [malId, genreId]);
                    }
                }
            }
            console.log(`UPDATED MAL SHOWS [${offset} - ${offset + edgeList.length}] successfully.`);
            offset += edgeList.length;
            await sleep(1500); 
        }
        console.log("MAL synchronization completed successfully!");
    } catch (error) {
        console.error("Critical error processing official MAL data:", error);
    }
}

async function fetchAndSaveAiringMALAnime(isHourlyUpdate = false) {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    try {
        let offset = 0;
        const limit = 500;
        let downloading = true;
        const rankingType = isHourlyUpdate ? 'airing' : 'all';
        console.log(`Starting MAL Sync (${rankingType}). Resuming from record offset: ${offset}`);
        while (downloading) {
            const malClientId = process.env.MAL_ID || process.env.MAL_CLIENT_ID;
            if (!malClientId) {
                console.error("MAL client ID is missing.");
                break;
            }
            const url = `https://api.myanimelist.net/v2/anime/ranking?ranking_type=${rankingType}&limit=${limit}&offset=${offset}&fields=alternative_titles,media_type,num_episodes,status,mean,synopsis,rating,genres`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 
                    'X-MAL-CLIENT-ID': malClientId,
                    'Accept': 'application/json'
                }
            });
            if (response.status === 429) {
                console.log("MAL Rate limit hit! Sleeping for 10 seconds...");
                await sleep(10000);
                continue;
            }
            if (response.status === 400) {
                const errorText = await response.text();
                console.error(`MAL API rejected request (400). Pagination boundary depth reached. Response: ${errorText}`);
                break;
            }
            if (!response.ok) {
                console.error(`MAL API Error: Status ${response.status}.`);
                break;
            }
            const payload = await response.json();
            const edgeList = payload.data || [];
            if (edgeList.length === 0) {
                console.log(`Sync completed for (${rankingType}). No more records remaining.`);
                break;
            }
            for (const edge of edgeList) {
                const node = edge.node;
                if (!node) continue;
                const insertSql = `
                    INSERT INTO mal_anime (mal_id, title, english_title, japanese_title, type, episodes, status, score, rating, synopsis, image_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        title = VALUES(title),
                        english_title = VALUES(english_title),
                        japanese_title = VALUES(japanese_title),
                        type = VALUES(type),
                        episodes = VALUES(episodes),
                        status = VALUES(status),
                        score = VALUES(score),
                        rating = VALUES(rating),
                        synopsis = VALUES(synopsis),
                        image_url = VALUES(image_url);
                `;
                const malId = node.id;
                const japaneseTitle = node.alternative_titles?.ja || null;
                await db.query(insertSql, [
                    malId,
                    node.title,
                    node.alternative_titles?.en || null,
                    japaneseTitle,
                    node.media_type || null,
                    node.num_episodes || null,
                    node.status || null,
                    node.mean || null,
                    node.rating || null,
                    node.synopsis || null,
                    node.main_picture?.large || node.main_picture?.medium || null
                ]);
                const apiGenres = node.genres || [];
                if (apiGenres.length > 0) {
                    for (const genreItem of apiGenres) {
                        const genreId = genreItem.id;
                        const genreName = genreItem.name;
                        const insertGenreSql = `
                            INSERT INTO mal_genres (genre_id, genre_name)
                            VALUES (?, ?)
                            ON DUPLICATE KEY UPDATE genre_name = VALUES(genre_name);
                        `;
                        await db.query(insertGenreSql, [genreId, genreName]);
                        const insertMappingSql = `
                            INSERT IGNORE INTO anime_genres_mapping (anime_id, genre_id)
                            VALUES (?, ?);
                        `;
                        await db.query(insertMappingSql, [malId, genreId]);
                    }
                }
            }
            console.log(`UPDATED MAL SHOWS [${offset} - ${offset + edgeList.length}] successfully.`);
            offset += edgeList.length;
            await sleep(1500); 
        }
    } catch (error) {
        console.error("Critical error processing official MAL data:", error);
    }
}

async function fetchEpisodesFromAniList(malId) {
    const query = `
        query ($idMal: Int) {
            Media (idMal: $idMal, type: ANIME) {
                id
                status
                episodes
                nextAiringEpisode {
                    episode
                    airingAt
                    timeUntilAiring
                }
            }
        }
    `;
    const variables = { idMal: parseInt(malId) };
    try {
        const response = await axios.post('https://graphql.anilist.co', {
            query: query,
            variables: variables
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
        });
        const media = response.data?.data?.Media;
        if (!media) return null;
        let totalEpisodes = media.episodes;
        if (media.status === 'RELEASING' && media.nextAiringEpisode) {
            totalEpisodes = media.nextAiringEpisode.episode - 1;
        }
        return {
            anilistId: media.id,
            status: media.status,
            episodes: totalEpisodes || 0,
            nextAiringEpisode: media.nextAiringEpisode ? media.nextAiringEpisode.episode : null,
            nextAiringAt: media.nextAiringEpisode ? media.nextAiringEpisode.airingAt : null,
            releasedEpisodes: media.status === 'RELEASING'
                ? (media.nextAiringEpisode ? Math.max(0, media.nextAiringEpisode.episode - 1) : null)
                : (media.status === 'FINISHED' ? (media.episodes || 0) : null)
        };
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.warn(`MAL ID ${malId} does not exist on AniList's schema framework.`);
        } else {
            console.error("Anilist Graphql Communication Failure:", error.message);
        }
        return null;
    }
}

async function fetchAnimeRelationsFromAniList(malId) {
    const query = `
        query ($idMal: Int) {
            Media(idMal: $idMal, type: ANIME) {
                relations {
                    edges {
                        relationType(version: 2)
                        node {
                            idMal
                            type
                            title { romaji english native }
                            format
                            episodes
                            coverImage { large }
                        }
                    }
                }
            }
        }
    `;
    const response = await axios.post('https://graphql.anilist.co', {
        query,
        variables: { idMal: Number.parseInt(malId, 10) }
    }, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });
    const edges = response.data?.data?.Media?.relations?.edges || [];
    return edges
        .filter(edge => ['PREQUEL', 'SEQUEL'].includes(edge.relationType)
            && edge.node?.type === 'ANIME' && Number(edge.node.idMal) > 0)
        .map(({ relationType, node }) => ({
            relationType,
            malId: Number(node.idMal),
            title: node.title?.romaji || node.title?.english || node.title?.native || 'Untitled anime',
            english_title: node.title?.english || null,
            japanese_title: node.title?.native || null,
            type: node.format || 'ANIME',
            score: null,
            image_url: node.coverImage?.large || null,
            episodes: node.episodes || null
        }));
}

async function checkWatchlistEpisodeReleases() {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let watchedAnime;
    try {
        [watchedAnime] = await db.execute(`
            SELECT DISTINCT a.mal_id, COALESCE(a.english_title, a.title) AS title
            FROM user_watchlist w
            INNER JOIN mal_anime a ON a.mal_id = w.anime_id
            LEFT JOIN (
                SELECT anime_id, MAX(episode_number) AS last_episode
                FROM anime_episode_releases
                GROUP BY anime_id
            ) tracked ON tracked.anime_id = a.mal_id
            WHERE a.status = 'currently_airing' OR tracked.anime_id IS NOT NULL
        `);
    } catch (error) {
        console.error('Could not load watchlist anime for release checks:', error);
        return;
    }
    console.log(`Checking AniList release status for ${watchedAnime.length} watched anime.`);
    for (const anime of watchedAnime) {
        try {
            const mediaStatus = await fetchEpisodesFromAniList(anime.mal_id);
            if (!mediaStatus || mediaStatus.releasedEpisodes === null) {
                await sleep(700);
                continue;
            }
            const releasedCount = Number(mediaStatus.releasedEpisodes) || 0;
            const [[tracked]] = await db.execute(`
                SELECT MAX(episode_number) AS last_episode
                FROM anime_episode_releases
                WHERE anime_id = ?
            `, [anime.mal_id]);
            if (tracked.last_episode === null) {
                await db.execute(`
                    INSERT IGNORE INTO anime_episode_releases (anime_id, episode_number, released_at)
                    VALUES (?, ?, NOW())
                `, [anime.mal_id, releasedCount]);
                await sleep(700);
                continue;
            }
            const lastReleased = Number(tracked.last_episode);
            if (releasedCount <= lastReleased) {
                await sleep(700);
                continue;
            }
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                for (let episode = lastReleased + 1; episode <= releasedCount; episode += 1) {
                    await connection.execute(`
                        INSERT IGNORE INTO anime_episode_releases (anime_id, episode_number, released_at)
                        VALUES (?, ?, NOW())
                    `, [anime.mal_id, episode]);
                    await connection.execute(`
                        INSERT IGNORE INTO aninotify
                            (user_id, anime_id, episode_number, title, message)
                        SELECT user_id, ?, ?, ?, ?
                        FROM user_watchlist
                        WHERE anime_id = ?
                    `, [
                        anime.mal_id,
                        episode,
                        `New episode: ${anime.title}`,
                        `Episode ${episode} of ${anime.title} is now available.`,
                        anime.mal_id
                    ]);
                }
                await connection.commit();
                console.log(`Created episode ${lastReleased + 1}-${releasedCount} notifications for ${anime.title}.`);
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error(`Release check failed for ${anime.title} (MAL ${anime.mal_id}):`, error.message);
        }
        await sleep(700);
    }
}

async function fetchUpcomingMALSeason(year, season) {
    const cacheKey = `${year}-${season}`;
    const cached = upcomingAnimeCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < UPCOMING_ANIME_CACHE_TTL_MS) return cached.animeList;

    const clientId = process.env.MAL_ID || process.env.MAL_CLIENT_ID;
    if (!clientId) {
        const error = new Error('MyAnimeList client ID is not configured.');
        error.statusCode = 503;
        throw error;
    }

    const fields = [
        'alternative_titles', 'start_date', 'synopsis', 'mean', 'media_type',
        'num_episodes', 'status', 'rating', 'genres'
    ].join(',');
    const firstUrl = new URL(`https://api.myanimelist.net/v2/anime/season/${year}/${season}`);
    firstUrl.searchParams.set('sort', 'anime_score');
    firstUrl.searchParams.set('limit', '100');
    firstUrl.searchParams.set('fields', fields);

    const rows = [];
    let nextUrl = firstUrl.toString();
    let pageCount = 0;
    while (nextUrl && pageCount < 5) {
        const parsedUrl = new URL(nextUrl);
        if (parsedUrl.origin !== 'https://api.myanimelist.net') {
            throw new Error('MyAnimeList returned an unexpected paging URL.');
        }
        const response = await fetch(parsedUrl, {
            headers: { 'X-MAL-CLIENT-ID': clientId, Accept: 'application/json' }
        });
        if (!response.ok) {
            const error = new Error(`MyAnimeList upcoming season request failed (${response.status}).`);
            error.statusCode = response.status === 429 ? 503 : 502;
            throw error;
        }
        const payload = await response.json();
        if (!Array.isArray(payload.data)) throw new Error('MyAnimeList returned an invalid seasonal anime response.');
        rows.push(...payload.data.map(item => item.node || item));
        nextUrl = payload.paging?.next || null;
        pageCount += 1;
    }

    const animeList = rows
        .filter(anime => anime && anime.rating?.toLowerCase() !== 'rx')
        .map(anime => ({
            mal_id: anime.id,
            title: anime.title,
            english_title: anime.alternative_titles?.en || null,
            japanese_title: anime.alternative_titles?.ja || null,
            type: anime.media_type || 'TV',
            episodes: anime.num_episodes || null,
            score: anime.mean || null,
            rating: anime.rating || null,
            status: anime.status || null,
            start_date: anime.start_date || null,
            synopsis: anime.synopsis || null,
            image_url: anime.main_picture?.large || anime.main_picture?.medium || null
        }))
        .sort((left, right) => {
            if (left.start_date && right.start_date && left.start_date !== right.start_date) {
                return left.start_date.localeCompare(right.start_date);
            }
            if (left.start_date) return -1;
            if (right.start_date) return 1;
            return Number(right.score || 0) - Number(left.score || 0);
        });

    upcomingAnimeCache.set(cacheKey, { animeList, cachedAt: Date.now() });
    return animeList;
}

async function getAiringSchedule(type) {
    const cached = airingScheduleCache.get(type);
    if (cached && Date.now() - cached.cachedAt < AIRING_SCHEDULE_CACHE_TTL_MS) {
        return cached.animeList;
    }
    const response = await fetch(`https://raw.githubusercontent.com/RockinChaos/AniSchedule/refs/heads/master/raw/${encodeURIComponent(type)}-schedule.json`);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${type} schedule: ${response.status}`);
    }
    const animeList = await response.json();
    if (!Array.isArray(animeList)) {
        throw new Error(`Invalid ${type} schedule response.`);
    }
    airingScheduleCache.set(type, { animeList, cachedAt: Date.now() });
    return animeList;
}

async function refreshAiringSchedule(type) {
    if (!['sub', 'dub'].includes(type)) throw new Error('Unsupported schedule type.');
    const animeList = await getAiringSchedule(type);
    const values = [];
    const cutoff = Math.floor(Date.now() / 1000) - (14 * 24 * 60 * 60);
    for (const anime of animeList) {
        const anilistId = Number(anime.id);
        if (!Number.isSafeInteger(anilistId) || anilistId <= 0) continue;
        const title = anime.title?.english || anime.title?.romaji;
        if (!title) continue;
        const japaneseTitle = anime.title?.native || anime.title?.romaji || title;
        const malId = Number(anime.idMal);
        const normalizedMalId = Number.isSafeInteger(malId) && malId > 0 ? malId : null;
        const imageUrl = anime.coverImage?.large || anime.coverImage?.extraLarge || null;
        for (const node of anime.airingSchedule?.nodes || []) {
            const episode = Number(node.episode);
            const airingAt = Number(node.airingAt);
            if (!Number.isSafeInteger(episode) || episode <= 0
                || !Number.isSafeInteger(airingAt) || airingAt < cutoff) continue;
            values.push([type, anilistId, normalizedMalId, episode, title, japaneseTitle, imageUrl, airingAt]);
        }
    }
    const chunkSize = 250;
    for (let offset = 0; offset < values.length; offset += chunkSize) {
        const chunk = values.slice(offset, offset + chunkSize);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        await db.execute(`
            INSERT INTO airing_schedule_entries
                (schedule_type, anilist_id, mal_id, episode, title, japanese_title, image_url, airing_at)
            VALUES ${placeholders}
            ON DUPLICATE KEY UPDATE
                mal_id = VALUES(mal_id),
                title = VALUES(title),
                japanese_title = VALUES(japanese_title),
                image_url = VALUES(image_url),
                airing_at = VALUES(airing_at)
        `, chunk.flat());
    }
    await db.execute(`
        DELETE FROM airing_schedule_entries
        WHERE airing_at < ?
    `, [cutoff]);
    return values.length;
}

async function refreshAllAiringSchedules() {
    const results = await Promise.allSettled(['sub', 'dub'].map(refreshAiringSchedule));
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`Could not refresh ${['sub', 'dub'][index]} airing schedule:`, result.reason.message);
        } else {
            console.log(`Saved ${result.value} ${['sub', 'dub'][index]} schedule entries.`);
        }
    });
}

let userXpReadyPromise;
async function ensureUserXpReady() {
    if (!userXpReadyPromise) {
        userXpReadyPromise = (async () => {
            await db.execute(`
                INSERT IGNORE INTO user_xp_events (user_id, event_type, source_key, xp_amount, created_at)
                SELECT user_id, 'watch', CONCAT(anime_id, ':', episode_number), 10, watched_at
                FROM user_watched_episodes
            `);
            await db.execute(`
                INSERT IGNORE INTO user_xp_events (user_id, event_type, source_key, xp_amount, created_at)
                SELECT user_id, 'comment', CAST(comment_id AS CHAR), 5, created_at
                FROM episode_comments
            `);
            await db.execute(`
                INSERT INTO user_xp_totals (user_id, xp)
                SELECT user_id, SUM(xp_amount)
                FROM user_xp_events
                GROUP BY user_id
                ON DUPLICATE KEY UPDATE xp = VALUES(xp)
            `);
        })().catch(error => {
            userXpReadyPromise = null;
            throw error;
        });
    }
    return userXpReadyPromise;
}

async function awardActivityXp(userId, eventType, sourceKey, points, dailyCap) {
    await ensureUserXpReady();
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(
            'INSERT IGNORE INTO user_xp_totals (user_id, xp) VALUES (?, 0)',
            [String(userId)]
        );
        await connection.execute(
            'SELECT xp FROM user_xp_totals WHERE user_id = ? FOR UPDATE',
            [String(userId)]
        );
        const [dailyEvents] = await connection.execute(`
            SELECT COUNT(*) AS event_count
            FROM user_xp_events
            WHERE user_id = ? AND event_type = ?
              AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)
        `, [String(userId), eventType]);
        if (dailyEvents[0].event_count >= dailyCap) {
            await connection.commit();
            return false;
        }
        const [insertResult] = await connection.execute(`
            INSERT IGNORE INTO user_xp_events (user_id, event_type, source_key, xp_amount)
            VALUES (?, ?, ?, ?)
        `, [String(userId), eventType, String(sourceKey), points]);
        if (insertResult.affectedRows > 0) {
            await connection.execute(
                'UPDATE user_xp_totals SET xp = xp + ? WHERE user_id = ?',
                [points, String(userId)]
            );
        }
        await connection.commit();
        return insertResult.affectedRows > 0;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function awardActivityXpSafely(userId, eventType, sourceKey, points, dailyCap) {
    try {
        return await awardActivityXp(userId, eventType, sourceKey, points, dailyCap);
    } catch (error) {
        console.error(`Could not award ${eventType} XP to user ${userId}:`, error.message);
        return false;
    }
}

try {
    // Run Functions Every Day at Midnight
    cron.schedule('0 0 * * *', async () => {
        await fetchAndSaveAllMALAnime();
    }, {
        scheduled: true,
        timezone: "America/Chicago"
    });
    // Run Functions Every Hour
    cron.schedule('30 * * * *', async () => {
        await fetchAndSaveAiringMALAnime(true);
        await checkWatchlistEpisodeReleases();
    }, {
        scheduled: true,
        timezone: "America/Chicago"
    });
    // Run Functions Every 3 Hours
    cron.schedule('20 */3 * * *', refreshAllAiringSchedules, {
        scheduled: true,
        timezone: "America/Chicago"
    });
} catch (err) {
    console.error("Cron Schedule Error:", err);
}
