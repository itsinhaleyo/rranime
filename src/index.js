require('dotenv').config();
const path = require('path'), express = require('express'), session = require('express-session'), MySQLStore = require('express-mysql-session')(session), axios = require('axios'), passport = require('passport'), nodemailer = require('nodemailer'), vhost = require('vhost'), cron = require('node-cron');

// Connect to Database
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

rranime.get('/login', (req, res) => {
    res.render('login', {});
});

rranime.post('/login', passport.authenticate('local', {
    successRedirect: '/home',
    failureRedirect: '/login'
}));

rranime.get('/profile', checkAuthenticated, async (req, res) => {
    try {
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
        res.render('profile', { profile, saved: req.query.saved === '1' });
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
            `SELECT mal_id, COALESCE(english_title, title) AS title
             FROM mal_anime
             WHERE status = 'currently_airing'
               AND (rating IS NULL OR rating != 'rx')
             ORDER BY COALESCE(score, 0) DESC
             LIMIT 4`
        );
        const [airingAnime] = await db.query(
            `SELECT mal_id, title, english_title, type, episodes, score, image_url
             FROM mal_anime
             WHERE status = 'currently_airing'
               AND (rating IS NULL OR rating != 'rx')
             ORDER BY COALESCE(score, 0) DESC
             LIMIT 6`
        );
        const [recentComments] = await db.execute(`
            SELECT c.comment_id, c.parent_comment_id, c.body, c.created_at,
                   c.anime_id, c.episode_number, a.title AS anime_title, a.english_title,
                   c.user_id, p.display_name, p.avatar_url, p.accent_color
            FROM episode_comments c
            INNER JOIN mal_anime a ON a.mal_id = c.anime_id
            LEFT JOIN user_profiles p ON p.user_id = c.user_id
            ORDER BY c.created_at DESC, c.comment_id DESC
            LIMIT 5
        `);
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
            `SELECT mal_id, title, english_title, type, episodes, score, synopsis, image_url 
             FROM mal_anime 
             WHERE type = 'TV' AND status = 'currently_airing'
               AND (rating IS NULL OR rating != 'rx')
             ORDER BY COALESCE(score, 0) DESC LIMIT 5`
        );
        const [latestEpisodes] = await db.query(
            `SELECT mal_id, title, type, episodes, image_url 
             FROM mal_anime 
             WHERE status = 'currently_airing' and rating != 'rx'
             ORDER BY last_updated DESC LIMIT 15`
        );
        const [sidebarTopAnime] = await db.query(
            `SELECT mal_id, title, type, score, image_url 
             FROM mal_anime 
             ORDER BY score DESC LIMIT 10`
        );
        const [airingAnime] = await db.execute(`
            SELECT mal_id, title, english_title, type, episodes, score, image_url 
            FROM mal_anime 
            WHERE status = 'currently_airing' and rating != 'rx'
            ORDER BY score DESC
            LIMIT 12
        `);
        const [recentComments] = await db.execute(`
            SELECT c.comment_id, c.parent_comment_id, c.body, c.created_at,
                   c.anime_id, c.episode_number, a.title AS anime_title, a.english_title,
                   c.user_id, p.display_name, p.avatar_url, p.accent_color
            FROM episode_comments c
            INNER JOIN mal_anime a ON a.mal_id = c.anime_id
            LEFT JOIN user_profiles p ON p.user_id = c.user_id
            ORDER BY c.created_at DESC, c.comment_id DESC
            LIMIT 5
        `);
        res.render('home', {
            airingAnime: airingAnime,
            spotlightAnime: spotlight,
            latestAnime: latestEpisodes,
            sidebarAnime: sidebarTopAnime,
            recentComments
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading RRA home page: " + err.message);
    }
});

rranime.get('/anime/:animeid', checkAuthenticated, async (req, res) => {
    try {
        const animeId = req.params.animeid;
        const activeUserId = req.user.id;
        const [rows] = await db.query(
            `SELECT a.mal_id, a.title, a.english_title, a.type, a.episodes, a.status, a.score, a.synopsis, a.image_url, a.rating,
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
            `SELECT mal_id, title, type, score, image_url 
             FROM mal_anime 
             WHERE mal_id != ? AND type = ?
             ORDER BY score DESC LIMIT 5`, [animeId, animeDetails.type]
        );
        res.render('view', {
            anime: animeDetails,
            recommendations: recommendedAnime,
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
            `SELECT mal_id, title, english_title, status, type, episodes, image_url 
             FROM mal_anime 
             WHERE mal_id = ?`, [animeId]
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
        if (currentEp >= 1 && currentEp <= totalEpisodesCount) {
            await db.execute(`
                INSERT IGNORE INTO user_watched_episodes (user_id, anime_id, episode_number)
                VALUES (?, ?, ?)
            `, [req.user.id, animeDetails.mal_id, currentEp]);
        }
        const [watchedEpisodeRows] = await db.execute(`
            SELECT episode_number
            FROM user_watched_episodes
            WHERE user_id = ? AND anime_id = ?
        `, [req.user.id, animeDetails.mal_id]);
        const [commentRows] = await db.execute(`
            SELECT c.comment_id, c.parent_comment_id, c.user_id, c.body, c.created_at,
                   p.display_name, p.avatar_url, p.accent_color
            FROM episode_comments c
            LEFT JOIN user_profiles p ON p.user_id = c.user_id
            WHERE c.anime_id = ? AND c.episode_number = ?
            ORDER BY c.created_at ASC, c.comment_id ASC
        `, [animeDetails.mal_id, currentEp]);
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
        res.render('watch', {
            anime: animeDetails,
            currentEpisode: currentEp,
            totalEpisodes: totalEpisodesCount,
            watchedEpisodes: watchedEpisodeRows.map(row => Number(row.episode_number)),
            anilistId: anilistData ? anilistData.anilistId : null,
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
        await db.execute(`
            INSERT INTO episode_comments (user_id, anime_id, episode_number, body)
            VALUES (?, ?, ?, ?)
        `, [String(req.user.id), animeId, episodeNumber, body]);
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

rranime.get('/airing', checkAuthenticated, async (req, res) => {
    try {
        const [airingAnime] = await db.execute(`
            SELECT mal_id, title, english_title, type, episodes, score, image_url, rating
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

rranime.get('/airingschedule/:type', checkAuthenticated, async (req, res) => {
    try {
        const now = new Date();
        const startOfWeek = Math.floor(new Date(now.setDate(now.getDate() - now.getDay())).setHours(0, 0, 0, 0) / 1000);
        const endOfWeek = startOfWeek + (7 * 24 * 60 * 60);
        const response = await fetch(`https://raw.githubusercontent.com/RockinChaos/AniSchedule/refs/heads/master/raw/${req.params.type}-schedule.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch raw static dataset from GitHub repository source: ${response.status}`);
        }
        const animeList = await response.json();
        const calendar = {
            Sunday: [], Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
        };
        const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDayName = weekDays[new Date().getDay()];
        animeList.forEach(anime => {
            if (!anime.airingSchedule || !anime.airingSchedule.nodes) return;
            anime.airingSchedule.nodes.forEach(node => {
                if (node.airingAt >= startOfWeek && node.airingAt < endOfWeek) {
                    const airDate = new Date(node.airingAt * 1000);
                    const dayName = weekDays[airDate.getDay()];
                    const timeString = airDate.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                    calendar[dayName].push({
                        mal_id: anime.idMal,
                        title: anime.title.english || anime.title.romaji,
                        image_url: anime.coverImage.large || anime.coverImage.extraLarge,
                        episode: node.episode,
                        airTime: timeString,
                        rawTimestamp: node.airingAt
                    });
                }
            });
        });
        for (const day in calendar) {
            calendar[day].sort((a, b) => a.rawTimestamp - b.rawTimestamp);
        }
        res.render('airingschedule', {
            schedule: calendar,
            today: currentDayName
        });
    } catch (err) {
        console.error("Airing schedule generation pipeline error:", err);
        res.status(500).send("Failed to parse remote streaming timetable channels: " + err.message);
    }
});

rranime.get('/trending', checkAuthenticated, async (req, res) => {
    try {
        const [airingAnime] = await db.execute(`
            SELECT mal_id, title, english_title, type, episodes, score, image_url 
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
            SELECT mal_id, title, english_title, type, episodes, score, image_url 
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
            SELECT a.mal_id, a.title, a.english_title, a.type, a.episodes, a.score, a.image_url, a.rating
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
            `SELECT mal_id, title, english_title, type, episodes, score, image_url 
             FROM mal_anime 
             WHERE title LIKE ? OR english_title LIKE ?
             ORDER BY score DESC LIMIT 36`, 
            [`%${searchQuery}%`, `%${searchQuery}%`]
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
            SELECT a.mal_id, a.title, a.english_title, a.type, a.episodes, a.score, a.image_url, a.status
            FROM mal_anime a
            INNER JOIN user_watchlist w ON a.mal_id = w.anime_id
            WHERE w.user_id = ?
            ORDER BY last_updated DESC
        `, [activeUserId]);
        const [sidebarTopAnime] = await db.query(`
            SELECT mal_id, title, type, score, image_url 
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
            SELECT mal_id, title, english_title, type, score, image_url 
            FROM mal_anime 
            WHERE title LIKE ? OR english_title LIKE ? 
            ORDER BY COALESCE(score, 0) DESC
            LIMIT 5
        `;
        const searchTerm = `%${query}%`;
        const [results] = await db.execute(sql, [searchTerm, searchTerm]);
        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database query failed' });
    }
});

rranime.get('/*any', (req, res) => { res.redirect('/home'); });

mainweb.use(vhost(`rranime.online`, rranime));
mainweb.listen(port, () => { console.log(`Website running on PORT:${port}/`); });

// Website Functions
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
                    INSERT INTO mal_anime (mal_id, title, english_title, type, episodes, status, score, rating, synopsis, image_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        title = VALUES(title),
                        english_title = VALUES(english_title),
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
                const type = node.media_type || null;
                const episodes = node.num_episodes || null;
                const status = node.status || null;
                const score = node.mean || null;
                const rating = node.rating || null;
                const synopsis = node.synopsis || null;
                const imageUrl = node.main_picture?.large || node.main_picture?.medium || null;
                await db.query(insertAnimeSql, [
                    malId, title, englishTitle, type, episodes, status, score, rating, synopsis, imageUrl
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
                    INSERT INTO mal_anime (mal_id, title, english_title, type, episodes, status, score, rating, synopsis, image_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        title = VALUES(title),
                        english_title = VALUES(english_title),
                        type = VALUES(type),
                        episodes = VALUES(episodes),
                        status = VALUES(status),
                        score = VALUES(score),
                        rating = VALUES(rating),
                        synopsis = VALUES(synopsis),
                        image_url = VALUES(image_url);
                `;
                const malId = node.id;
                await db.query(insertSql, [
                    malId,
                    node.title,
                    node.alternative_titles?.en || null,
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

// Scheduled Cron Jobs
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
} catch (err) {
    console.error("Cron Schedule Error:", err);
}
