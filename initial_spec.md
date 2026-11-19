# Technical Interview Platform

> The original product specification. The implementation covers Phase 1 and Phase 2 (see §13, MVP acceptance criteria). Architecture decisions taken during implementation are recorded in [`docs/adr/`](docs/adr/).

## Contents

1. [Project overview](#1-project-overview)
2. [Technology stack](#2-technology-stack)
3. [Application architecture](#3-application-architecture)
4. [Code editor](#4-code-editor)
5. [Activity tracking](#5-activity-tracking)
6. [Event correlation and analysis](#6-event-correlation-and-analysis)
7. [Real-time communication](#7-real-time-communication)
8. [Database design](#8-database-design)
9. [Security and privacy](#9-security-and-privacy)
10. [Development roadmap](#10-development-roadmap)
11. [Suggested NestJS module structure](#11-suggested-nestjs-module-structure)
12. [Suggested React application structure](#12-suggested-react-application-structure)
13. [MVP acceptance criteria](#13-mvp-acceptance-criteria)
14. [Final architectural decisions](#14-final-architectural-decisions)

---

## 1. Project overview

### Goal

Build a web application for technical interviews. It lets the interviewer give the candidate technical tasks and watch how they are completed in real time.

The core idea is not just to provide an online code editor, but to make the process of solving the task transparent.

The interviewer must be able to:

- Create and manage technical tasks.
- Create interview sessions.
- Send the candidate a link to join.
- Watch code changes in real time.
- Track the candidate's actions in the editor.
- Review the history of actions and changes.
- Analyse how the task was solved after the interview ends.

### Core principles

1. **Browser-based application.** The candidate does not need to install any additional software.
2. **Real-time monitoring.** The interviewer sees the candidate's actions almost instantly.
3. **Activity tracking.** Actions on the code and in the editor are recorded.
4. **Session recording.** The history of the candidate's work is stored.
5. **Simplicity.** The minimum necessary architecture, without premature complexity.

---

## 2. Technology stack

| Component | Technology |
|---|---|
| Frontend | React + TypeScript |
| UI components | Material UI |
| Code editor | Monaco Editor |
| Backend | NestJS |
| Real-time communication | Socket.IO |
| Database | PostgreSQL |
| ORM | Prisma |
| Frontend state | Zustand |
| Authentication | JWT / session tokens |
| Code execution | Isolated sandbox (future) |

### Architecture considerations

- The frontend is initially deployed as a static application.
- The backend provides a REST API and a WebSocket gateway.
- Socket.IO handles real-time communication between the interviewer and the candidate.
- PostgreSQL stores interviews, sessions, events and code snapshots.
- No Redis is required for the initial single-instance deployment.
- No CRDT/Yjs is required, because the interviewer only observes the candidate's editor.

---

## 3. Application architecture

The application consists of three logical interfaces.

### 3.1. Interviewer workspace

Interface for creating and managing interviews.

Features:

- Create an interview.
- Create and edit technical tasks.
- Configure the programming language.
- Generate an interview session.
- Generate a candidate invitation link.
- Monitor active sessions.
- Review completed interviews.

### 3.2. Candidate workspace

Interface accessible through a unique invitation link.

Features:

- Display interview instructions.
- Display the technical task.
- Code editor powered by Monaco.
- Syntax highlighting.
- Basic IntelliSense.
- Code editing.
- Connection status.
- Interview timer.
- Session start and end controls.

The candidate should not need to register an account.

### 3.3. Interview monitoring dashboard

Interface used by the interviewer during an active session.

#### Code editor

- Live representation of the candidate's editor.
- Read-only mode.
- Current code state.
- Programming language.

#### Activity timeline

- Chronological list of candidate actions.
- Event timestamps.
- Event details.
- Ability to navigate through historical events.

#### Session information

- Candidate connection status.
- Session duration.
- Last activity.
- Browser visibility status.
- Current task.

---

## 4. Code editor

Use Monaco Editor.

### Required functionality

- JavaScript / TypeScript support.
- Syntax highlighting.
- Code formatting.
- IntelliSense.
- Line numbers.
- Multiple themes.
- Configurable editor options.

### Editor events

The application should subscribe to Monaco Editor events and to the relevant browser DOM events.

> **Important distinction:** Monaco model events provide information about document changes, while clipboard and selection events require additional event handlers.

---

## 5. Activity tracking

One of the most important components of the application. The system should track the candidate's interactions with the editor and the browser.

### 5.1. Clipboard events

#### `COPY`

Detect when the candidate copies selected text from the editor.

Capture:

- Timestamp.
- Selected text.
- Text length.
- Selection start and end positions.
- Editor document version.

#### `CUT`

Detect when the candidate cuts selected text.

Capture:

- Timestamp.
- Cut text.
- Text length.
- Selection positions.

#### `PASTE`

Detect when the candidate pastes content into the editor.

Capture:

- Timestamp.
- Pasted text.
- Text length.
- Cursor position.
- Editor document version.

#### Important limitations

The browser allows tracking clipboard events that occur inside the application, subject to browser permissions and event handling.

The application cannot reliably determine:

- Where copied text was subsequently pasted.
- Whether the candidate pasted text into ChatGPT or another application.
- What the candidate copied outside the application.
- Which external application was used.

If the candidate copies code from an external editor and pastes it into the interview editor, the application can detect the paste and inspect its contents, but cannot identify the source.

### 5.2. Selection tracking

Track text selection inside Monaco Editor.

Capture:

- Selection start and end positions.
- Selected text length.
- Selection timestamp.
- Editor document version.

Potential use cases:

- Understanding which parts of the solution the candidate examines.
- Detecting large selections before copying.
- Correlating selection events with `COPY` events.

Selection events should be debounced or selectively recorded to avoid generating an excessive volume of events.

### 5.3. Text editing events

Track document modifications.

Events:

- `TEXT_CHANGE`
- `TEXT_INSERT`
- `TEXT_DELETE`

Capture:

- Timestamp.
- Changed range.
- Inserted or deleted text, where available.
- Document version.
- Reference to the resulting code snapshot.

The system should distinguish ordinary typing from large document changes.

### 5.4. Browser activity

Track browser and editor interaction.

| Event | Description |
|---|---|
| `EDITOR_FOCUS` | Editor receives focus |
| `EDITOR_BLUR` | Editor loses focus |
| `TAB_HIDDEN` | Browser tab becomes hidden |
| `TAB_VISIBLE` | Browser tab becomes visible |
| `WINDOW_FOCUS` | Browser window receives focus |
| `WINDOW_BLUR` | Browser window loses focus |
| `IDLE` | No editor activity for a configured period |

These events provide additional context, but cannot establish what the candidate is doing outside the browser.

---

## 6. Event correlation and analysis

The application should not only record individual events, but also provide useful contextual information.

Example: a copy followed by a matching paste.

```text
14:02:10 COPY
  Selected lines: 10-35
  Length: 640 characters
14:02:45 PASTE
  Length: 640 characters
  Content match: 100%
```

Example: typing followed by a large paste.

```text
14:05:10 TEXT_CHANGE
  Inserted: 12 characters
14:05:15 TEXT_CHANGE
  Inserted: 8 characters
14:05:20 PASTE
  Inserted: 850 characters
14:05:21 CODE_SNAPSHOT
  Document changed significantly
```

### Potential analysis features

- Large paste detection.
- Rapid code insertion detection.
- Copy/paste correlation.
- Significant code changes.
- Long periods of inactivity.
- Frequent browser tab switching.

These indicators should be presented as observations, not as definitive evidence of cheating or AI usage.

---

## 7. Real-time communication

Use a NestJS WebSocket gateway with Socket.IO.

### 7.1. Session model

Each interview session is a separate Socket.IO room, for example:

```text
interview:session:{sessionId}
```

Participants:

- Interviewer.
- Candidate.

### 7.2. Connection workflow

1. The interviewer creates an interview.
2. The backend creates an interview session.
3. The backend generates a secure invitation token.
4. The candidate opens the invitation link.
5. The candidate authenticates using the session token.
6. The candidate joins the session room.
7. The interviewer joins the same room.
8. Candidate activity is transmitted to the backend.
9. The backend persists events and broadcasts relevant updates to the interviewer.

### 7.3. WebSocket events

#### Candidate → backend

| Event | Description |
|---|---|
| `session:join` | Join interview session |
| `editor:change` | Editor content changed |
| `editor:copy` | Text copied |
| `editor:cut` | Text cut |
| `editor:paste` | Text pasted |
| `editor:selection` | Text selection changed |
| `editor:focus` | Editor focused |
| `editor:blur` | Editor lost focus |
| `browser:visibility` | Browser visibility changed |
| `session:end` | Candidate ends session |

#### Backend → interviewer

| Event | Description |
|---|---|
| `session:connected` | Candidate connected |
| `session:disconnected` | Candidate disconnected |
| `editor:updated` | Editor content updated |
| `activity:recorded` | New activity event |
| `session:status` | Session status changed |
| `session:ended` | Interview completed |

### Reliability considerations

- WebSocket reconnection.
- Event acknowledgements.
- Session authorisation.
- Duplicate event prevention.
- Event ordering.
- Periodic code snapshots.
- Recovery after temporary disconnection.

The backend should be the source of truth for session state and persisted activity history.

---

## 8. Database design

Initial Prisma data model.

### `Interview`

| Field |
|---|
| `id` |
| `title` |
| `description` |
| `createdBy` |
| `createdAt` |
| `updatedAt` |

### `InterviewTask`

| Field |
|---|
| `id` |
| `interviewId` |
| `title` |
| `description` |
| `initialCode` |
| `language` |
| `createdAt` |
| `updatedAt` |

### `InterviewSession`

| Field |
|---|
| `id` |
| `interviewId` |
| `candidateName` |
| `status` |
| `accessTokenHash` |
| `startedAt` |
| `endedAt` |
| `createdAt` |

### `ActivityEvent`

| Field |
|---|
| `id` |
| `sessionId` |
| `eventType` |
| `payload` |
| `timestamp` |
| `sequenceNumber` |

### `CodeSnapshot`

| Field |
|---|
| `id` |
| `sessionId` |
| `documentVersion` |
| `content` |
| `createdAt` |

### Database considerations

- `ActivityEvent` should be append-only.
- Use JSONB for event-specific payloads.
- Index events by `sessionId` and `timestamp`.
- Store periodic snapshots rather than persisting the entire document after every keystroke.
- Consider snapshot compression for longer interviews.

---

## 9. Security and privacy

Security is particularly important because the application exposes candidate activity.

Requirements:

- Unique session invitation tokens.
- Expiring session links.
- Secure WebSocket authentication.
- A candidate cannot access other interview sessions.
- Interviewer authorisation.
- Server-side validation of all incoming events.
- Rate limiting.
- HTTPS/WSS only.
- Protection against session token reuse.

### Privacy considerations

Candidates should be informed about activity tracking before starting an interview.

The application should clearly explain which activities are recorded:

- Copy, cut and paste.
- Text selection.
- Code modifications.
- Editor focus.
- Browser tab visibility.

The application must not claim to monitor external applications or the candidate's entire computer.

Define a data retention policy for code, clipboard content and activity history.

---

## 10. Development roadmap

### Phase 1: Basic interview workspace (MVP)

**Goal:** get a working interview environment.

Tasks:

- Initialise the React application.
- Initialise the NestJS backend.
- Configure PostgreSQL and Prisma.
- Integrate Monaco Editor.
- Create interview management.
- Create technical tasks.
- Implement interview sessions.
- Generate candidate invitation links.
- Implement the Socket.IO gateway.
- Implement session rooms.
- Implement live code synchronisation.
- Build the interviewer monitoring dashboard.

**Expected result:** the interviewer can create an interview, send a link to a candidate and observe their code in real time.

### Phase 2: Activity tracking

**Goal:** understand how the candidate works on the task.

Tasks:

- Implement `COPY` detection.
- Implement `CUT` detection.
- Implement `PASTE` detection.
- Capture copied and pasted text.
- Implement selection tracking.
- Implement text change tracking.
- Implement editor focus/blur tracking.
- Implement browser visibility tracking.
- Persist activity events.
- Implement the activity timeline.
- Implement event correlation.
- Add large paste detection.

**Expected result:** the interviewer can see not only the resulting code, but also the sequence of actions that led to it.

### Phase 3: Session replay

**Goal:** reconstruct the candidate's workflow after the interview.

Tasks:

- Implement periodic code snapshots.
- Store editor document versions.
- Implement event timeline navigation.
- Implement historical code reconstruction.
- Implement replay controls.
- Synchronise the replay position with activity events.

**Expected result:** the interviewer can replay the coding process and inspect the code at any point during the interview.

### Phase 4: Advanced interview features

**Goal:** expand the platform into a more complete technical interview solution.

Potential features:

- Multiple editor files.
- JavaScript/TypeScript execution.
- Automated test execution.
- Custom test cases.
- Interview notes.
- Interview evaluation and scoring.
- Candidate history.
- Interview templates.
- Multiple programming languages.
- AI-assisted code analysis.

Code execution must run in an isolated sandbox, not directly inside the NestJS backend process.

### Recommended order

Keep to this order of development: first a working session and live synchronisation, then activity tracking, and then replay. This produces a useful tool early on without overloading the first version.

The next step is to turn this plan into detailed technical specifications with DTOs, WebSocket contracts and Prisma models.

---

## 11. Suggested NestJS module structure

```text
src/
  modules/
    auth/
    interviews/
    tasks/
    sessions/
    activity/
    snapshots/
    websocket/
  prisma/
  common/
    guards/
    decorators/
    filters/
    interceptors/
    dto/
```

| Module | Responsibility |
|---|---|
| `AuthModule` | Authentication and authorisation |
| `InterviewsModule` | Interview management |
| `TasksModule` | Technical task management |
| `SessionsModule` | Interview session lifecycle |
| `ActivityModule` | Activity event processing and persistence |
| `SnapshotsModule` | Code snapshot management |
| `WebSocketModule` | Real-time communication |

---

## 12. Suggested React application structure

```text
src/
  app/
    router/
    providers/
  features/
    interviews/
    tasks/
    sessions/
    monitoring/
    activity/
  components/
    CodeEditor/
    ActivityTimeline/
    SessionStatus/
  services/
    api/
    websocket/
  stores/
    sessionStore/
    editorStore/
  types/
```

Primary application routes:

```text
/interviewer/interviews
/interviewer/sessions/:sessionId
/candidate/session/:token
```

---

## 13. MVP acceptance criteria

The first version is considered functional when:

1. The interviewer can create a technical interview.
2. The interviewer can create and configure a coding task.
3. The interviewer can generate a candidate invitation link.
4. The candidate can join without creating an account.
5. The candidate can write code in Monaco Editor.
6. The interviewer sees code changes in real time.
7. The system detects `COPY`, `CUT` and `PASTE` events.
8. The system captures selected, copied and pasted text where available.
9. The system tracks editor focus and browser visibility.
10. All activity events are persisted.
11. The interviewer can inspect the activity timeline.
12. A session can be completed and reviewed afterwards.

---

## 14. Final architectural decisions

For the initial implementation, the following decisions are recommended:

| Area | Decision |
|---|---|
| Frontend architecture | Single React application with role-based routes |
| Backend architecture | Modular NestJS monolith |
| Code editor | Monaco Editor |
| Real-time communication | Socket.IO |
| Session management | Socket.IO rooms |
| Data persistence | PostgreSQL + Prisma |
| Activity tracking | Browser events + Monaco API |
| Event storage | Append-only event log |
| Code history | Periodic snapshots + document versions |
| Deployment | Static frontend + NestJS backend |
| Infrastructure | Single backend instance initially |

The primary objective of the MVP is to provide a real-time coding interview environment with transparent tracking of candidate activity.

Advanced analytics, code execution, AI detection and collaborative editing are explicitly outside the scope of the initial MVP.
