# 🎵 MusicForge API - Unified Music Intelligence

[![API Version](https://img.shields.io/badge/API-v1.0.0-blue)](https://api.musicforge.io/docs)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-18+-brightgreen)](https://nodejs.org/)

> **The world's first unified music intelligence API** - One API to rule them all: LLM-powered music understanding, YouTube search & download, advanced audio analysis, and a template marketplace.

## 🚀 **What is MusicForge?**

Instead of juggling 5-10 different services (OpenAI, YouTube Data API, yt-dlp, Essentia, etc.), developers can now use **one powerful API** that understands natural language music requests and returns fully analyzed tracks.

```bash
curl -X POST https://api.musicforge.io/v1/music/process \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "request": "Find me chill lofi house tracks around 120 BPM in C minor",
    "maxTracks": 5,
    "analyzeAudio": true
  }'
```

**Returns analyzed tracks with:**
- ✅ BPM, musical key, energy level
- ✅ Waveform data for visualization  
- ✅ Direct download URLs
- ✅ Camelot wheel notation for harmonic mixing
- ✅ 95%+ accuracy music understanding

## 🎯 **Core Features**

### **🧠 LLM Music Understanding**
- Natural language processing with GPT-4/Claude
- Extracts BPM ranges, keys, genres, moods from human requests
- Smart search term generation for maximum relevance

### **🎬 YouTube Integration**
- Official YouTube Data API v3 integration
- Intelligent search with music-specific filters
- High-quality audio extraction via yt-dlp
- Metadata enrichment and validation

### **🔊 Advanced Audio Analysis**
- Real-time BPM detection
- Musical key identification (with Camelot notation)
- Energy level analysis (0-1 scale)
- Waveform peak generation for visualization
- Multiple analysis engines for maximum accuracy

### **🏪 Template Marketplace**
- Pre-built application templates (DJ apps, music discovery, etc.)
- One-click deployment with custom configuration
- Revenue sharing for template creators
- Complete tech stacks included

## 📚 **API Documentation**

### **Main Endpoint: Process Music Request**
```typescript
POST /v1/music/process
{
  "request": "energetic progressive trance for peak time, 128-132 BPM",
  "maxTracks": 10,
  "analyzeAudio": true,
  "downloadQuality": "high"
}
```

### **Response**
```json
{
  "success": true,
  "data": {
    "tracks": [
      {
        "id": "uuid",
        "title": "Midnight Trance",
        "artist": "DJ Producer",
        "youtubeId": "abc123",
        "audioUrl": "https://cdn.musicforge.io/audio/abc123.mp3",
        "bpm": 130,
        "musicalKey": "C minor",
        "camelotKey": "5A",
        "energyLevel": 0.85,
        "waveformPeaks": [0.1, 0.3, 0.8, ...],
        "analysisStatus": "completed"
      }
    ],
    "totalFound": 1,
    "confidence": 0.95,
    "processingSteps": [...]
  }
}
```

### **Other Endpoints**
- `GET /v1/music/search` - YouTube search only
- `POST /v1/music/analyze` - Audio analysis only
- `GET /v1/templates` - Browse template marketplace
- `POST /v1/templates/{id}/deploy` - Deploy templates

## 🛠️ **Tech Stack**

- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL + Redis
- **Audio**: FFmpeg + Essentia + AudD.io
- **AI**: OpenAI GPT-4 / Claude
- **Queue**: Bull Queue for background processing
- **Storage**: AWS S3 + CloudFront CDN
- **Deployment**: Docker + AWS ECS

## 🏃‍♂️ **Quick Start**

### **1. Get API Key**
```bash
curl -X POST https://api.musicforge.io/v1/auth/register \
  -d '{"email":"you@example.com","password":"secure123","name":"Your Name"}'
```

### **2. Make Your First Request**
```bash
curl -X POST https://api.musicforge.io/v1/music/process \
  -H "X-API-Key: mf_your_api_key_here" \
  -d '{"request":"upbeat house music for working out"}'
```

### **3. Build Something Awesome**
Check out our [template marketplace](https://api.musicforge.io/v1/templates) for instant app deployment!

## 💰 **Pricing**

| Plan | Requests/Hour | Price | Best For |
|------|---------------|--------|----------|
| **Free** | 100 | $0 | Testing & prototyping |
| **Starter** | 1,000 | $29/mo | Small apps |
| **Pro** | 10,000 | $99/mo | Production apps |
| **Scale** | 50,000 | $299/mo | High-volume |
| **Enterprise** | Custom | Custom | Large organizations |

## 🎨 **Use Cases**

- **🎧 DJ Applications** (like MixForge)
- **🎵 Music Discovery Apps**
- **📻 Radio Station Management**
- **🎬 Content Creation Tools**
- **🎓 Music Education Platforms**
- **🤖 AI Music Assistants**

## 🚀 **Local Development**

```bash
# Clone the repository
git clone https://github.com/your-username/musicforge-api.git
cd musicforge-api

# Install dependencies
cd backend && npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Run migrations
npm run db:migrate

# Start development server
npm run dev
```

## 🤝 **Contributing**

We're building the future of music development! Contributions are welcome.

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ **Support**

- 📚 [API Documentation](https://api.musicforge.io/docs)
- 💬 [Discord Community](https://discord.gg/musicforge)
- 📧 [Email Support](mailto:support@musicforge.io)
- 🐛 [Report Issues](https://github.com/your-username/musicforge-api/issues)

---

**Built with ❤️ for the music development community**

*MusicForge API - Because every developer deserves a unified music intelligence platform.*
