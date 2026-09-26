# CodePulse-TechTriathlon2026
Integrated logistics ecosystem for Waypoint Group built for Rootcode Tech-Triathlon 2026. Features fleet allocation, cutoff management, LIFO dock loading, and offline-first driver navigation.

## 🌐 Live System & Seeded Credentials

- **Live Application URL:** [https://your-deployed-app-url.com](https://your-deployed-app-url.com)
- **API Documentation / Health Check:** [https://your-deployed-app-url.com/api/docs](https://your-deployed-app-url.com/api/docs)

### Seeded Test Accounts

Below are pre-configured test credentials for each user role in the system:

| Role | Email / Username | Password | Purpose / Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@example.com` | `AdminPass123!` | Full system control, user management, and global settings |
| **Manager** | `manager@example.com` | `ManagerPass123!` | Management level access, report viewing, team assignment |
| **Standard User** | `user@example.com` | `UserPass123!` | Regular user workflow, profile creation, and core feature access |

---

## 🏗️ System Architecture & Data Model

### Architecture Diagram

```
[ Frontend (React/Next.js) ] <---> [ REST/GraphQL API Gateway ]
                                                |
                                                v
                                   [ Backend Services (Node/Python/Go) ]
                                                |
                                                v
                                    [ Database (PostgreSQL/MongoDB) ]
```

#### System Components
- **Frontend App:** Serves the client user interface built with modern web frameworks.
- **Backend Service:** Manages authentication, business logic, and API endpoints.
- **Database:** Stores relational data with automatic migrations and seed data on initialization.

---

### Data Model Overview

The database schema is structured around the following core entities:

- **Users:** Stores user profiles, authentication metadata, and role attributes (`ADMIN`, `MANAGER`, `USER`).
- **Resources / Entities:** Main business objects managed by the system.
- **Audit Logs / Transactions:** Records user actions and system changes for security and tracking.

*(Replace with your detailed ERD or database schema description)*

---

## 🐳 Quick Start with Docker Compose

You can spin up the entire application stack locally using Docker Compose from the root directory.

### Prerequisites
- [Docker](https://www.docker.com/get-started) (v20.10 or higher)
- [Docker Compose](https://docs.docker.com/compose/) (v2.0 or higher)
- [Git](https://git-scm.com/)

### Setup Instructions

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/YourOrg/TeamName_SolutionName.git
   cd TeamName_SolutionName
   ```

2. **Set Up Environment Variables:**
   Copy the example environment file to create your local environment file:
   ```bash
   cp .env.example .env
   ```
   *(Optionally inspect `.env` to modify default ports or secret keys if necessary)*

3. **Run the Application Stack:**
   ```bash
   docker compose up --build
   ```
   *This command builds the services, starts the database, executes migrations, and seeds default test data.*

4. **Access the Local Services:**
   - **Frontend App:** `http://localhost:3000`
   - **Backend API:** `http://localhost:8000`
   - **Database Port:** `localhost:5432`

5. **Stop the Application Stack:**
   ```bash
   docker compose down -v
   ```

---

## ⚙️ Configuration & Environment Variables

Key parameters defined in `.env.example`:

| Environment Variable | Description | Default Value |
| :--- | :--- | :--- |
| `NODE_ENV` | Application running environment | `development` |
| `PORT` | Backend server port | `8000` |
| `DATABASE_URL` | Database connection string | `postgres://user:pass@db:5432/appdb` |
| `JWT_SECRET` | Secret key for auth tokens | `your-super-secret-key` |

---

## 💡 Application Walkthrough & User Flows

1. **Authentication:** Log in using one of the pre-seeded account credentials above.
2. **Dashboard Overview:** Experience tailored UI views based on the logged-in user role.
3. **Core Features:**
   - **Admin:** View system metrics, manage user roles, and inspect logs.
   - **User:** Perform primary operations, create items, and generate reports.

---

## 🔀 Design Departures

During implementation, the following design and technical departures were made from the initial specification:

1. **Database Selection:** Changed from SQLite to PostgreSQL for better concurrency handling in production containers.
2. **Authentication Flow:** Switched to HTTP-only cookies instead of localStorage JWT tokens to enhance security.
3. **UI Component Restructuring:** Combined certain step-by-step form wizards into a single-page reactive form to improve user experience.

---

## 🎥 Demo Video

Watch our 5–8 minute walkthrough video demonstrating all user roles, key functionality, and a brief walkthrough of the codebase and architecture:

- 📺 **YouTube Video Link:** [https://www.youtube.com/watch?v=YOUR_VIDEO_ID](https://www.youtube.com/watch?v=YOUR_VIDEO_ID) *(Unlisted)*

---

## 🤖 AI Tool Disclosure

In accordance with project guidelines, here is a transparent breakdown of how AI tools were utilized during development:

### What was AI-Assisted:
- Initial boilerplate configuration and `.env.example` setup.
- Generating mock seed datasets for database population.
- Writing repetitive CSS styling utility classes and unit test stubs.

### What was NOT AI-Assisted:
- Core system architecture design and database schema decisions.
- Critical business logic algorithms and role-based authorization security implementations.
- Final code integration, debugging, deployment, and testing.

### Tools & Methods Used:
- **GitHub Copilot:** Used for code completion and syntax assistance during backend controller development.
- **ChatGPT / Claude:** Used for brainstorming architecture patterns, drafting README documentation structure, and generating SQL seed script templates.
