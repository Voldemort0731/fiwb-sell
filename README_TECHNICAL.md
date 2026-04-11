# FIWB: Institutional Intelligence & Digital Twin (Detailed Technical Specification)

## 0. Overview
FIWB is a specialized Neural Academic platform designed to synthesize institutional data with personal student context into a "Digital Twin." Thits document provides a comprehensive map of data handling, architectural logic, and third-party integrations for the purpose of privacy policy drafting and technical audits.

---

## 1. Data Ingestion & Integration (External Sources)

### 1.1 Google Classroom (LMS)
- **Scope**: Course names, teacher profiles, coursework (assignments), course materials, and announcements.
- **Handling**: Fetched via the Google Classroom API using OAuth 2.0.
- **Persistence**: Metadata (titles, IDs, due dates) is cached in the local SQLite database (`materials` table). Rich content and attachments are indexed into the Supermemory vector store.

### 1.2 Gmail (Neural Assistant)
- **Search Criteria**: Specifically targets the `category:primary` inbox with an `after:(14 days ago)` lookback.
- **Analysis**: Every qualifying email is analyzed by an SLM (GPT-4o-mini) to extract "Assistant Knowledge" (appointments, project details, personal preferences).
- **Persistence**: Identified insights are stored in Supermemory. Highly personal or actionable items are synthesized into the user's Long-Term Memory (Digital Twin).

### 1.3 Google Drive (Personal Workspace)
- **Scope**: Specifically targets PDF, Plain Text, and Google Docs (`application/vnd.google-apps.document`) within user-selected folders or the root.
- **Handling**: Content is extracted (using `pypdf` for PDFs, export-to-text for Google Docs).
- **Persistence**: Extracted text is indexed into Supermemory for RAG retrieval.

### 1.4 Moodle (Institutional LMS)
- **Scope**: Course structures and modules (resources, URLs, forums, assignments).
- **Handling**: Fetched via Moodle REST API using user-provided URLs and Tokens.
- **Persistence**: Similar to Classroom, metadata is stored locally while core resource content is indexed in Supermemory.

### 1.5 Direct Chat Uploads
- **Scope**: User-uploaded PDFs, text files, and images.
- **Handling**: Text is extracted locally.
- **Persistence**: Uploaded text content is immediately indexed into Supermemory under the category `chat_attachment`, tagged with the specific `thread_id`.

---

## 2. The Digital Twin & Intelligence Core

### 2.1 The Retrieval Engine (RAG Loop)
Every message triggers a **Parallel Retrieval Phase** that queries 5 distinct context streams:
1. **Academic Vault**: Synced course material.
2. **Assistant Intel**: Synced Gmail context.
3. **Chat Assets**: Historically uploaded files.
4. **Enhanced Memories**: Insights derived from past user conversations.
5. **User Profile**: Persistent signals about learning styles and strengths.

**Data Isolation**: Every search query is strictly filtered by `user_id` (standardized email) within the vector database to ensure zero cross-talk between users.

### 2.2 Memory Synthesis (Background Learning)
Following every interaction, a **Synthesis Agent** analyzes the conversation:
- Extracts **Learning Style Signals** (e.g., visual learner, prefers witty tone).
- Extracts **Knowledge Gaps** (topics the user struggled with).
- Extracts **Strengths** (concepts the user mastered).
- **Storage**: These insights are formatted into a "User Profile" document in Supermemory, which serves as the persistent "Digital Twin" identity.

---

## 3. Storage & Data Persistence

### 3.1 Local SQLite Database (app.db)
- **User Table**: Stores standardized email, Google OAuth tokens (access/refresh), token expiry, Moodle credentials, and usage statistics.
- **ChatThread/ChatMessage**: Stores raw conversation history, including Base64-encoded attachment previews.
- **Material Table**: Stores metadata and short previews of synced academic items.
- **Course Table**: Stores course names and instructional metadata.

### 3.2 Supermemory (Vector Database)
- Stores the high-entropy vector embeddings of all text data (synced materials, email insights, chat history).
- Every document is metadata-tagged with: `user_id`, `source`, `type`, and `timestamp`.

---

## 4. AI Model Usage & Data Privacy

### 4.1 Triage & Classification (SLM Tier)
- **Model**: `gpt-4o-mini`
- **Function**: Determines query intent (Academic vs. General Chat) and handles background synthesis.
- **Data Exposed**: Raw user query and minimal metadata.

### 4.2 Socratic Mentoring (LLM Tier)
- **Model**: `gpt-4o`
- **Function**: Generates the final, high-fidelity tutored responses.
- **Data Exposed**: The user's current query, search results from the 5 retrieval streams, and the last 10 messages of conversation history.

---

## 5. Security & Authentication

- **Identity**: All user identification is forced through a `standardize_email` utility to prevent "ghost" profiles. (Example: `user+alias@gmail.com` maps to `user@gmail.com`).
- **OAuth Handling**: Refresh tokens are stored securely to allow background Gmail/Classroom sync. Tokens are refreshed automatically before expiry.
- **Push Notifications**: Real-time sync is enabled via **Google Pub/Sub** webhooks (`setup_watch` for Gmail).

---

## 6. Financial Analytics & Usage Tracking
The system tracks usage in USD with micro-precision across:
- **SLM Costs**: Tracking triage and memory synthesis tokens.
- **LLM Costs**: Tracking main conversation tokens.
- **Supermemory Costs**: Tracking token-based indexing and search overhead.
- **API Requests**: Counts for Classroom, Gmail, and Moodle API calls.

---
*Technical Auditor Note: This system is designed for high-context personalization, requiring the processing of private communications. Data is strictly scoped to the authenticated user and used exclusively for generating personalized tutoring context.*
