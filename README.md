# RRAnime

RRAnime is an anime discovery and watchlist website built with Node.js, Express, EJS, and MySQL. It uses MyAnimeList for catalog data and AniList for airing episode information.

## Features

- Search the anime catalog and browse airing, trending, genre, and schedule pages.
- Open anime detail pages and episode pages with third-party streaming embeds.
- Keep a personal watchlist and import entries from a MyAnimeList username.
- Track episodes a user has opened.
- Customize a profile with a display name, bio, avatar URL, and accent color.
- Post episode comments and replies. Reply authors receive in-app notifications.
- View recent comments on the landing page and the main `/home` page.
- Receive in-app notifications when new episodes are detected for watchlisted anime.
- Run scheduled catalog updates and airing checks.

## Technology

- Node.js 18 or newer
- Express 5 and EJS
- MySQL-compatible database
- Passport Local authentication and MySQL-backed sessions
- MyAnimeList API v2 and AniList GraphQL

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.envexample` to `.env` and set the values for your environment. Do not commit `.env` or put real credentials in this README.

```dotenv
DB_HOST=localhost
DB_USER=your_database_user
DB_PASS=your_database_password
DB_NAME=your_database_name
PORT=3000
SESSION_SECRET=replace_with_a_long_random_secret
USER_1=your_first_password
USER_2=your_second_password
USER_3=your_third_password
MAL_ID=your_myanimelist_client_id
```

`DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `PORT`, and `SESSION_SECRET` configure the database, listener, and session. `USER_1`, `USER_2`, and `USER_3` configure the three password-based local user identities. `MAL_ID` is the MyAnimeList API client ID used by catalog synchronization and watchlist import. AniList GraphQL requests do not require an API key in the current implementation.

`.envexample` also contains `MAL_SECRET` and `DOMAIN`, but the current app code does not read those settings.

There is no public registration flow or per-user password management. The login form accepts one of the configured passwords. The app currently binds its virtual host to `rranime.online` in `src/index.js`; local development must use that hostname or adjust the host configuration. Sessions use secure cookies, so sign-in over plain HTTP requires HTTPS or a development-only cookie configuration change.

### 3. Prepare the database

Create a MySQL-compatible database and apply `src/database/schema.sql` to a fresh database. It defines the anime catalog, watchlist, profile, comment/reply, notification, and episode tracking tables. The MySQL session store manages its own session table.

The project does not include an incremental database migration runner or a migration script for existing installs. Do not run the full schema over a populated database. Back up the database, compare its tables with `src/database/schema.sql`, and apply the missing table or column changes before updating an existing installation. Comment replies require `episode_comments.parent_comment_id` and the `comment_notifications` table.

Set `DB_NAME` to the database containing these tables. A new database may have little anime data until the scheduled MyAnimeList sync runs or catalog data is imported.

### 4. Start the application

```bash
npm start
```

For development with Node's watch mode:

```bash
npm run dev
```

The server listens on the port set by `PORT`.

## Routes

All application pages and APIs below require authentication unless noted otherwise. `/login` is public.

| Route | Purpose |
| --- | --- |
| `/login` | Password-based sign-in |
| `/logout` | Sign out |
| `/` | Landing page with popular airing anime and newest comments |
| `/home` | Anime spotlight, Airing Now, newest comments, and latest episodes |
| `/search?keyword=...` | Search anime titles |
| `/anime/:animeId` | Anime details, watchlist controls, and episode directory |
| `/anime/:animeId/:episode` | Episode player, episode directory, and discussion |
| `POST /anime/:animeId/:episode/comments` | Post an episode comment |
| `POST /anime/:animeId/:episode/comments/:commentId/reply` | Reply to a top-level comment and notify its author |
| `POST /anime/:animeId/:episode/comments/:commentId/delete` | Delete your own comment or reply |
| `/watchlist` | View a personal watchlist |
| `POST /watchlist/add` and `POST /watchlist/remove/:animeId` | Add or remove an anime from the watchlist |
| `POST /watchlist/import-mal` | Import a MyAnimeList anime list |
| `/profile` | Customize a personal profile |
| `/airing` | Currently airing anime |
| `/trending` | Trending anime |
| `/hentai` | Anime marked with the `rx` rating |
| `/airingschedule/:type` | Weekly schedule, such as `/airingschedule/sub` |
| `/genres` and `/genres/:genreId` | Browse anime genres |
| `/notifications` | View episode and comment-reply notifications |
| `POST /notifications/:id/read` and `POST /notifications/:id/delete` | Mark an episode notification read or delete it |
| `POST /notifications/comments/:id/read` and `POST /notifications/comments/:id/delete` | Mark a reply notification read or delete it |
| `/api/notifications/preview` | Return recent notifications for the header dropdown |
| `/api/anime-suggestions?q=...` | Return anime search suggestions |

## Scheduled jobs and data notes

Cron jobs use the `America/Chicago` timezone:

- Daily at midnight, synchronize catalog data from MyAnimeList.
- At 30 minutes past each hour, refresh currently airing catalog data and check watchlisted anime for new episodes using AniList.

Episode notifications are based on AniList airing information and may reflect scheduled release timing. They do not independently confirm availability from a streaming provider. Episode progress records that a user opened an episode page; it does not confirm playback completion. Streaming embeds are provided by third-party hosts and depend on those hosts being available.

## Project layout

```text
src/
  database/
    db.js                 MySQL connection pool
    schema.sql            Database table definitions
  public/
    css/                  Page and shared stylesheets
    script/               Browser-side interactions
    templates/            EJS pages and shared partials
  index.js                Express routes, authentication, APIs, and cron jobs
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
