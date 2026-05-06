<div align="center">
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/NextJS-Dark.svg" alt="Next.js" width="40" height="40"/>
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/FastAPI.svg" alt="FastAPI" width="40" height="40"/>
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Python-Dark.svg" alt="Python" width="40" height="40"/>
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/PostgreSQL-Dark.svg" alt="PostgreSQL" width="40" height="40"/>
  
  <br/>
  
  <h1>FIWB AI University</h1>
  <p><strong>The world's first AI-native, Socratic Academic Ecosystem powered by Neural Digital Twins.</strong></p>
</div>

<br/>

## 🌟 Overview

FIWB is an enterprise-grade academic platform designed to replace traditional learning management systems (LMS). It bridges the gap between institutional course materials and personal student contexts, providing an elite, highly-personalized Socratic mentoring experience. 

The ecosystem consists of three unified pillars:
1. **The Student Neural Dashboard**: For interactive learning and mastery tracking.
2. **The Professor Analytics Portal**: For AI-assisted grading and curriculum insights.
3. **Memsapien (The Neural Engine)**: A sophisticated, Cloudflare-backed vector RAG architecture providing long-term memory synthesis.

---

## 🚀 Key Features

### 👨‍🎓 For Students
- **Socratic Vivas**: Move away from multiple-choice quizzes. Engage in dynamic, AI-led conversational assessments that truly evaluate depth of reasoning.
- **Knowledge Mastery Graph**: A visually interactive, nodal representation of your conceptual understanding, updating in real-time as you chat and learn.
- **Digital Twin (Long-Term Memory)**: The AI extracts strengths, identifies knowledge gaps, and evolves its teaching style specifically for you.
- **Unified Document Intelligence**: Chat directly with uploaded PDFs, PowerPoint slides, and auto-transcribed YouTube lectures.

### 👨‍🏫 For Professors
- **AI Quiz Drafting**: Turn a simple uploaded syllabus or lecture video into a comprehensive AI assessment draft with a single click.
- **Engagement Heatmaps**: Visually track exactly which textbook pages or concepts are generating the most questions and confusion among your class.
- **Pedagogical Insights**: View a high-level dashboard displaying institutional mastery averages, recent student submissions, and AI-assisted grading reports.
- **Automated Grading Assistant**: Receive detailed breakdowns of student performance (Strengths, Gaps, and Grading Notes) after they complete a Viva session.

---

## 🛠️ Architecture & Tech Stack

FIWB is built for ultra-low latency and scalable academic intelligence.

- **Frontend**: Next.js 14, React, TailwindCSS, Framer Motion, KaTeX (for mathematical rendering).
- **Backend**: FastAPI (Python 3.10+), SQLAlchemy.
- **Database**: PostgreSQL (Production) / SQLite (Local Development).
- **Intelligence Core**: OpenAI (GPT-4o, GPT-4o-mini).
- **Neural Engine**: Integrates natively with the [Memsapien](https://github.com/your-org/memsapien) RAG engine (Cloudflare Workers, R2, Durable Objects).

---

## ⚙️ Local Development Setup

To run the FIWB ecosystem locally for testing and development:

### 1. Prerequisites
- Node.js v20+
- Python 3.10+
- Access to a running instance of Memsapien (defaulting to `http://localhost:3003`)

### 2. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
OPENAI_API_KEY=sk-...
MEMSAPIEN_API_KEY=your_key
MEMSAPIEN_API_URL=http://localhost:3003
DATABASE_URL=sqlite:///./fiwb.db
```

### 3. Running the Stack
We provide convenience scripts to boot the entire monorepo simultaneously.

**Windows:**
```cmd
.\run_locally.bat
```

**Linux/macOS:**
```bash
./run_locally.sh
```
The Frontend will be available at `http://localhost:3000` and the Backend API at `http://localhost:8002`.

*(Note: To populate the database with dummy data for testing, run `python backend/scripts/seed_dev.py` and `python backend/scripts/seed_professor.py`)*

---

## ☁️ Production Deployment Guide

FIWB is designed for a split-architecture deployment for optimal performance.

### 1. The Frontend (Vercel)
Vercel is the optimal host for Next.js.
1. Connect your GitHub repository to Vercel.
2. Select the `frontend` root directory.
3. Add the required environment variable:
   - `NEXT_PUBLIC_API_URL`: `https://your-railway-backend-url.app`
4. Deploy!

### 2. The Backend & Database (Railway)
Railway excels at hosting Python services and managed databases.
1. Create a new Railway project and provision a **PostgreSQL** database.
2. Connect your GitHub repository and select the `backend` directory.
3. Railway will automatically detect the `requirements.txt`.
4. Define your Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add your environment variables:
   - `DATABASE_URL`: *(Provided automatically by your Railway Postgres addon)*
   - `OPENAI_API_KEY`: Your OpenAI key.
   - `MEMSAPIEN_API_URL`: The production URL of your Memsapien engine.

---

<div align="center">
  <i>Developed for the AI-First Academic Era.</i>
</div>
