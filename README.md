# RRAnime

RRAnime is an anime discovery, watchlist, and community application. Its website and mobile client share a React Native interface (React Native Web in the browser), while a Node.js/Express server handles authentication, page data, MySQL persistence, streaming integrations, and scheduled catalog updates. Existing MyAnimeList, AniList, AniSchedule, and MySQL data remain on the server; the client uses those existing routes and records.

## Features

- Browse popular and currently airing anime, trending titles, genres, and weekly release schedules.
- Open genre links from anime details or episode series information to browse titles in that genre.
- Browse the next anime season through the MyAnimeList seasonal anime API.
- Search using English, romaji, or Japanese titles, and switch displayed anime titles between English and Japanese.
- View anime details, prequel and sequel relationships, streaming providers, subtitles or dubs, episode navigation, series and episode information, episode discussions, and a countdown to the next scheduled episode when data is available. Watch controls and the episode selector are hidden for titles marked `not_yet_aired`. Episodes advance automatically when the selected player reports completion.
- Save a preferred SUB or DUB audio language from the episode player; new shows use that preference unless the URL explicitly selects an audio option.
- Share a link to an episode.
- Add anime to a personal watchlist or import a list from a MyAnimeList username.
- Track episode history and resume position. Continue Watching is available from `/` and the hamburger menu; precise timestamps are currently recorded for the Zoko player, which exposes playback events.
- Customize a profile with a display name, bio, avatar URL, and accent color.
- Earn activity XP by opening episode pages and posting comments or replies. Activity rank badges appear on profiles, episode comments, and live watch room chat. User ID 1 always has the ADMIN rank.
- Post episode comments and replies. Users receive in-app notifications when someone replies to their comment.
- See newest comments on the landing page and /, and a seven-day estimated subtitled release schedule on /.
- Legacy EJS pages provide page-specific metadata descriptions when opened with `?legacy=1`.
- Receive in-app episode notifications for anime on the watchlist.
- Create link-shareable episode rooms with synchronized Zoko playback, shared SUB/DUB selection, room chat, and viewer presence. The host can switch everyone to the previous or next episode, while automatic advance moves everyone forward when playback ends. Episode-specific room links keep the room and chat together; the host can also end a room manually. Guests must sign in to join.
- Use the shared interface on the web and prepare Android or iOS native builds through Expo. Native project folders are generated locally and are not included in the repository.

## Technology and requirements

- Node.js 18 or newer and npm
- MySQL-compatible database
- Express 5, EJS, Passport Local, and MySQL-backed sessions
- MyAnimeList API v2, AniList GraphQL, and AniSchedule JSON feeds
- Expo and React Native with React Native Web for the shared browser and phone client

## React Native client and existing backend

The app in `client/` is the shared React Native interface for the website and native mobile builds. React Native Web renders the same app in browsers. Express and MySQL remain the backend and source of truth: the client requests page data with `Accept: application/vnd.rranime.page+json` and submits changes through the existing routes, reusing the existing accounts, database tables, and stored data.

When `client/dist` exists, normal browser page requests are served by the exported app. Add `?legacy=1` to a page URL to view its original EJS-rendered version. The EJS templates, CSS, and browser scripts are still part of the project for this legacy mode and for server-rendered responses; they should not be removed until those paths are retired.

For local web UI development, run `npm run app:web`. The Expo development server runs separately from Express, so set `EXPO_PUBLIC_API_URL` to the backend's HTTPS origin before starting it (for example, `https://dev.rranime.online`). For a same-origin deployed website bundle, the app uses the current browser origin automatically. Session cookies are secure-only, so authenticated development against the backend requires HTTPS.

Build the browser bundle with `npm run app:export`. This creates `client/dist`, which is ignored by Git and must be present on the server for normal browser visits to use the React Native Web app. Generate native project files with `npm run app:prebuild`; then use `npm run app:android` or `npm run app:ios` on a machine with the corresponding Android or Apple development tools. The generated Android and iOS project folders are local build outputs, not committed application sources.

## Getting started

### 1. Install dependencies

~~~bash
npm install
~~~

For a repeatable install from the lockfile, use npm ci.

### 2. Configure environment variables

Copy .envexample to .env and fill in the database and account values. Keep .env and all real credentials out of source control.

| Variable | Purpose |
| --- | --- |
| DB_HOST | MySQL server host |
| DB_USER | Database username |
| DB_PASS | Database password |
| DB_NAME | Database name |
| PORT | HTTP listener port |
| SESSION_SECRET | Secret used to sign sessions; use a long, random value |
| USER_1 through USER_6 | Passwords for up to six configured local accounts; `USER_1` is the ADMIN account |
| MAL_ID | MyAnimeList API client ID for catalog sync and list import |
| MAL_SECRET, DOMAIN | Present in the example file but not currently read by the application |

The current login is password-based: there is no public registration, individual password management, or account recovery. USER_1 maps to user ID 1, whose activity rank is always ADMIN. AniList GraphQL and the AniSchedule feed are accessed without credentials in the current implementation.

The application routes requests through a virtual host configured as rranime.online in src/index.js. For local development, use that hostname or adjust the virtual-host configuration. Session cookies are secure-only, so authentication requires HTTPS unless you make a development-only cookie configuration change.

### 3. Prepare the database

Apply `src/database/schema.sql`. Existing databases must be backed up and updated to include every table and column in the current schema before deploying;

### 4. Start the application

~~~bash
npm start
~~~

For development with Node's watch mode:

~~~bash
npm run dev
~~~

The server listens on the port in PORT. The project does not currently define a test script.

To run the browser client separately during UI development, configure `EXPO_PUBLIC_API_URL` as described above and run:

~~~bash
npm run app:web
~~~

For the normal website flow, run `npm run app:export` after client changes so Express can serve the updated `client/dist` bundle.

## Routes

Feature pages and APIs require authentication; login and logout remain accessible without an active session. Unmatched paths redirect to /.

| Route | Purpose |
| --- | --- |
| / | Spotlight, airing anime, Continue Watching, newest comments, latest episodes, and estimated schedule |
| /login, POST /login, /logout | Sign in and sign out |
| /profile, POST /profile | View and customize your profile and activity rank |
| /continue-watching | View the most recent unfinished episode for each series and resume playback |
| /search?keyword=... | Search anime by title |
| /anime/:animeId | Anime details, linked genres, AniList prequel/sequel relationships, watchlist controls, and episode directory (episode controls are hidden for `not_yet_aired` titles) |
| /anime/:animeId/:episode | Episode player, schedule countdown, discussion, and replies |
| POST /api/preferred-audio | Save the signed-in user's preferred SUB/DUB audio language |
| /watch2gether | Browse open episode rooms |
| POST /watch2gether/create | Create a room from an episode page |
| /watch2gether/:roomId | Join a room; redirects to its current episode URL |
| /watch2gether/:roomId/episode/:episode | Join the room at its current episode; stale episode URLs redirect to the latest room episode |
| POST /anime/:animeId/:episode/comments | Post a comment |
| POST /anime/:animeId/:episode/comments/:commentId/reply | Reply to a comment and notify its author |
| POST /anime/:animeId/:episode/comments/:commentId/delete | Delete your own comment or reply |
| /airing, /trending, /hentai | Browse airing, trending, or Rx-rated titles |
| /upcoming | Browse the next season's anime from the MyAnimeList API |
| /airingschedule | View the weekly subtitled release timetable |
| /genres, /genres/:genreId | Browse genres |
| /watchlist | View your watchlist |
| POST /watchlist/add, POST /watchlist/remove/:animeId | Add or remove a title |
| POST /watchlist/import-mal | Import a MyAnimeList list |
| /notifications | View episode and comment-reply notifications |
| /notifications/:id/open | Mark an episode notification as read and open its episode |
| /notifications/comments/:id/open | Mark a reply notification as read and open the comment |
| POST /notifications/:id/read, POST /notifications/:id/delete | Manage an episode notification |
| POST /notifications/comments/:id/read, POST /notifications/comments/:id/delete | Manage a reply notification |
| /api/notifications/preview | Recent notifications for the header |
| /api/anime-suggestions?q=... | Anime title suggestions for search |
| POST /api/watch-progress | Save the signed-in user's episode position and completion state |
| /api/watch-rooms/:roomId/events | Live room state, presence, and chat event stream |
| /api/watch-rooms/:roomId/messages | Send a room chat message |
| /api/watch-rooms/:roomId/state | Host playback-state updates |
| /api/watch-rooms/:roomId/audio | Host SUB/DUB change for everyone in the room |
| POST /api/watch-rooms/:roomId/episode | Host moves everyone to the previous or next episode |
| /api/watch-rooms/:roomId/advance | Advance the room to the next episode or close it at a known series finale |
| /api/watch-rooms/:roomId/end | Let the host close the room |

## Activity XP and ranks

- Opening an episode page for a distinct episode can award 10 XP once.
- Posting a comment or reply can award 5 XP.
- Each account can earn XP from up to five watch events and five comment events in a rolling 24-hour period.
- Ranks progress through Newbie (0 XP), Side Character (1,000), Casual Watcher (2,500), Seasonal Viewer (10,000), Certified Weeb (25,000), Anime Veteran (50,000), and Anime Legend (100,000).
- User ID 1 always displays ADMIN regardless of XP.

Opening an episode page records it in history; Zoko playback events update the saved position and duration. Continue Watching can seek back to that timestamp when the episode is reopened with Zoko. Other providers do not expose playback progress in the current implementation, so their timestamps cannot be tracked or resumed precisely. Completion is only recorded when the player reports an end event.

## Schedule and background updates

The application runs its cron jobs in the America/Chicago timezone:

- Daily at midnight: synchronize anime catalog data from MyAnimeList.
- At 30 minutes past each hour: refresh currently airing titles and check watchlisted titles for newly released episodes with AniList.
- Every three hours at 20 minutes past the hour: save both subtitled and dubbed AniSchedule data into the database.

Schedule data is cached in memory for five minutes. Saved entries are updated when new schedule data is available and entries older than 14 days are pruned. The / estimated schedule and weekly timetable use this data; estimates and release times depend on the upstream feed and may be incomplete or change. Schedule times are formatted using the application server's local timezone.

Episode notifications reflect AniList release information and do not confirm availability from a streaming provider. When an anime is first tracked with at least one released episode, current watchlist users receive an episode 1 notification and the current release count is saved as the baseline; future release checks notify for new episodes without sending a backlog of older episode notifications. Streaming embeds are hosted by third parties and can be unavailable or behave differently across browsers.

## Title language preference

The English/Japanese title control is included in the shared header. The selected preference is saved in browser local storage. Japanese title data comes from MyAnimeList catalog synchronization and native titles in the AniSchedule feed; coverage depends on the available source data. The Upcoming Anime page queries the next season from MyAnimeList. The `/anime/:animeId` detail page gets prequel and sequel relationships from AniList; entries already in the local catalog link to RRAnime detail pages, while other entries link to MyAnimeList. Genre links on the detail and episode pages open the corresponding genre listing.

The SUB/DUB preference selected in the `/anime/:animeId/:episode` player is saved in `user_profiles.preferred_audio` and applies to other shows when their URL does not explicitly set `audio=sub` or `audio=dub`.

## Episode watch rooms

Create a room from an episode page. Rooms use the Zoko player because its documented postMessage interface supports playback state, seeking, autoplay, and auto-next settings. The host controls playback, the shared SUB/DUB setting, and the previous/next episode buttons; each change updates the room for connected viewers. Playback-end advance remains enabled. Episode changes navigate to `/watch2gether/:roomId/episode/:episode`, preserving the room and chat, and old episode links redirect to the room's current episode. Viewers can use the chat and presence list. Autoplay can still require a user tap if a browser blocks playback. Other streaming providers are not synchronized.

Room records and chat are stored in MySQL. Room events are delivered through server-sent events from the running Node.js process, so this implementation expects one application instance unless a shared event transport is added. A room is deleted, including its chat, when a known finished series reaches its final episode or when the host ends it. If the catalog lacks a reliable final episode count or finished status, the host can close the room manually.

## Project layout

~~~text
src/
  database/
    db.js                 MySQL connection pool
    schema.sql            Fresh database schema
    migrations/           One-time SQL upgrades for existing databases
  public/
    css/                  Legacy page and shared styles
    script/               Legacy browser interactions
    templates/            Legacy EJS pages and shared partials
  index.js                Express routes, data sync, and cron jobs
client/
  App.js                  Shared React Native application and screens
  WatchRoomPage.js        Shared watch-room interface
  PlayerView.*.js         Platform-specific player wrappers
  app.json                Expo app configuration
  dist/                   Generated React Native Web export (gitignored)
~~~

## Native mobile builds

The repository contains the Expo/React Native source and configuration, not committed Android Studio or Xcode project folders. Run `npm run app:prebuild` to generate native projects. Android builds require Android Studio/SDK tooling; iOS builds and signing require Xcode on macOS. The mobile client still needs the Express backend and its MySQL database. Set `EXPO_PUBLIC_API_URL` to the server's HTTPS origin when testing from a device. The platform-specific player wrappers are in `client/PlayerView.native.js` and `client/PlayerView.web.js`; third-party streaming embeds and watch-room playback should be checked on target devices before release.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and deployment guidance.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
