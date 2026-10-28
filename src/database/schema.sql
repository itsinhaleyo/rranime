CREATE TABLE mal_anime (
    mal_id INT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    english_title VARCHAR(255),
    japanese_title VARCHAR(255),
    type VARCHAR(50),
    episodes INT,
    status VARCHAR(50),
    rating VARCHAR(50),
    genre VARCHAR(50),
    score DECIMAL(4,2),
    synopsis TEXT,
    image_url VARCHAR(500),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE mal_genres (
    genre_id INT PRIMARY KEY,
    genre_name VARCHAR(100) NOT NULL
);

CREATE TABLE anime_genres_mapping (
    anime_id INT,
    genre_id INT,
    PRIMARY KEY (anime_id, genre_id),
    FOREIGN KEY (anime_id) REFERENCES mal_anime(mal_id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES mal_genres(genre_id) ON DELETE CASCADE
);

CREATE TABLE user_watchlist (
    user_id VARCHAR(100) NOT NULL,
    anime_id INT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, anime_id),
    FOREIGN KEY (anime_id) REFERENCES mal_anime(mal_id) ON DELETE CASCADE
);

CREATE TABLE user_profiles (
    user_id VARCHAR(100) NOT NULL PRIMARY KEY,
    display_name VARCHAR(40) NOT NULL DEFAULT '',
    bio VARCHAR(280) NOT NULL DEFAULT '',
    avatar_url VARCHAR(500) NOT NULL DEFAULT '',
    accent_color CHAR(7) NOT NULL DEFAULT '#ff3c20',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE episode_comments (
    comment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    anime_id INT NOT NULL,
    episode_number INT NOT NULL,
    parent_comment_id BIGINT UNSIGNED DEFAULT NULL,
    body VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_episode_comments (anime_id, episode_number, created_at),
    INDEX idx_user_episode_comments (user_id, comment_id),
    INDEX idx_parent_comment (parent_comment_id),
    CONSTRAINT fk_episode_comment_parent FOREIGN KEY (parent_comment_id)
        REFERENCES episode_comments(comment_id) ON DELETE CASCADE
);

CREATE TABLE comment_notifications (
    notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipient_user_id VARCHAR(100) NOT NULL,
    actor_user_id VARCHAR(100) NOT NULL,
    comment_id BIGINT UNSIGNED NOT NULL,
    anime_id INT NOT NULL,
    episode_number INT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_comment_reply_notification (recipient_user_id, comment_id),
    INDEX idx_comment_notification_recipient (recipient_user_id, is_read, created_at),
    CONSTRAINT fk_comment_notification_comment FOREIGN KEY (comment_id)
        REFERENCES episode_comments(comment_id) ON DELETE CASCADE
);

CREATE TABLE anime_episode_releases (
    anime_id INT NOT NULL,
    episode_number INT NOT NULL,
    released_at DATETIME NOT NULL,
    notified_at DATETIME DEFAULT NULL,
    PRIMARY KEY (anime_id, episode_number)
);

CREATE TABLE airing_schedule_entries (
    schedule_type VARCHAR(8) NOT NULL,
    anilist_id BIGINT UNSIGNED NOT NULL,
    mal_id INT NULL,
    episode INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    japanese_title VARCHAR(255),
    image_url VARCHAR(500) NULL,
    airing_at BIGINT UNSIGNED NOT NULL,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (schedule_type, anilist_id, episode),
    INDEX idx_airing_schedule_time (schedule_type, airing_at)
);

CREATE TABLE aninotify (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    anime_id INT NOT NULL,
    episode_number INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message VARCHAR(500) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_episode (user_id, anime_id, episode_number),
    INDEX idx_user_unread (user_id, is_read, created_at)
);

CREATE TABLE user_watched_episodes (
    user_id VARCHAR(100) NOT NULL,
    anime_id INT NOT NULL,
    episode_number INT NOT NULL,
    watched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, anime_id, episode_number),
    INDEX idx_user_anime (user_id, anime_id)
);

CREATE TABLE user_xp_totals (
    user_id VARCHAR(100) NOT NULL PRIMARY KEY,
    xp BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE user_xp_events (
    xp_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(16) NOT NULL,
    source_key VARCHAR(100) NOT NULL,
    xp_amount INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_xp_source (user_id, event_type, source_key),
    INDEX idx_user_xp_daily (user_id, event_type, created_at)
);

CREATE TABLE watch_rooms (
    room_id VARCHAR(16) NOT NULL PRIMARY KEY,
    host_user_id VARCHAR(100) NOT NULL,
    anime_id INT NOT NULL,
    anime_title VARCHAR(255) NOT NULL,
    current_episode INT NOT NULL,
    total_episodes INT NOT NULL DEFAULT 0,
    series_finished BOOLEAN NOT NULL DEFAULT FALSE,
    audio VARCHAR(8) NOT NULL DEFAULT 'sub',
    position_seconds DECIMAL(10,3) NOT NULL DEFAULT 0,
    is_paused BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_watch_rooms_updated (updated_at)
);

CREATE TABLE watch_room_messages (
    message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(16) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    body VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_watch_room_messages (room_id, message_id),
    CONSTRAINT fk_watch_room_message_room FOREIGN KEY (room_id)
        REFERENCES watch_rooms(room_id) ON DELETE CASCADE
);
