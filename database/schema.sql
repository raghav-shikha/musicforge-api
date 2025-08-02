-- MusicForge API Database Schema

-- Users and API Keys
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(255),
    company VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    rate_limit_tier VARCHAR(50) DEFAULT 'free'
);

-- Music Requests and Processing
CREATE TABLE music_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    api_key_id UUID REFERENCES api_keys(id),
    original_query TEXT NOT NULL,
    processed_query JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    result JSONB,
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Tracks and Audio Analysis
CREATE TABLE tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    artist VARCHAR(500),
    duration_seconds INTEGER,
    thumbnail_url TEXT,
    youtube_url TEXT,
    audio_url TEXT,
    s3_key VARCHAR(500),
    
    -- Audio Analysis
    bpm DECIMAL(6,2),
    musical_key VARCHAR(10),
    camelot_key VARCHAR(5),
    energy_level DECIMAL(3,2),
    loudness DECIMAL(6,2),
    tempo_confidence DECIMAL(3,2),
    key_confidence DECIMAL(3,2),
    
    -- Waveform Data
    waveform_peaks JSONB,
    waveform_duration INTEGER,
    
    -- Metadata
    genre VARCHAR(100),
    mood VARCHAR(100),
    tags TEXT[],
    
    analysis_status VARCHAR(50) DEFAULT 'pending',
    analysis_completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Templates and Marketplace
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    tech_stack JSONB,
    config_schema JSONB,
    deployment_config JSONB,
    price_cents INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT false,
    download_count INTEGER DEFAULT 0,
    rating DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE template_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    template_id UUID REFERENCES templates(id),
    deployment_url TEXT,
    config JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage Analytics
CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    api_key_id UUID REFERENCES api_keys(id),
    endpoint VARCHAR(255),
    method VARCHAR(10),
    status_code INTEGER,
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhooks
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_tracks_youtube_id ON tracks(youtube_id);
CREATE INDEX idx_tracks_bpm ON tracks(bpm) WHERE bpm IS NOT NULL;
CREATE INDEX idx_tracks_musical_key ON tracks(musical_key) WHERE musical_key IS NOT NULL;
CREATE INDEX idx_music_requests_user_id ON music_requests(user_id);
CREATE INDEX idx_music_requests_created_at ON music_requests(created_at);
CREATE INDEX idx_api_usage_user_id_created_at ON api_usage(user_id, created_at);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Update timestamps function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tracks_updated_at BEFORE UPDATE ON tracks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
