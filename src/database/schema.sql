CREATE TABLE mal_anime (
    mal_id INT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    english_title VARCHAR(255),
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
