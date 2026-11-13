Technical Interview Platform

1. Project Overview

Goal

Разработать веб-приложение для проведения технических интервью, которое позволяет интервьюеру предоставлять кандидату технические задания и наблюдать за процессом их выполнения в режиме реального времени.

Основная идея — не просто предоставить онлайн-редактор кода, а обеспечить прозрачность процесса решения задачи.

Интервьюер должен иметь возможность:

* Создавать и управлять техническими заданиями.
* Создавать интервью-сессии.
* Отправлять кандидату ссылку для подключения.
* Наблюдать за изменениями кода в реальном времени.
* Отслеживать действия кандидата в редакторе.
* Просматривать историю действий и изменений.
* Анализировать процесс решения задачи после завершения интервью.

Основные принципы

1. Browser-based application — кандидату не нужно устанавливать дополнительное ПО.
2. Real-time monitoring — интервьюер видит действия кандидата практически мгновенно.
3. Activity tracking — фиксируются действия с кодом и редактором.
4. Session recording — сохраняется история работы кандидата.
5. Simplicity — минимально необходимая архитектура без преждевременного усложнения.

⸻

2. Technology Stack

Component	Technology
Frontend	React + TypeScript
UI Components	Material UI
Code Editor	Monaco Editor
Backend	NestJS
Real-time Communication	Socket.IO
Database	PostgreSQL
ORM	Prisma
Frontend State	Zustand
Authentication	JWT / Session Tokens
Code Execution	Isolated Sandbox (Future)

Architecture considerations

* Frontend initially deployed as a static application.
* Backend provides REST API and WebSocket Gateway.
* Socket.IO handles real-time communication between interviewer and candidate.
* PostgreSQL stores interviews, sessions, events and code snapshots.
* No Redis required for the initial single-instance deployment.
* No CRDT/Yjs required because the interviewer only observes the candidate’s editor.

⸻

3. Application Architecture

The application consists of three logical interfaces.

3.1. Interviewer Workspace

Interface for creating and managing interviews.

Features:

* Create interview.
* Create/edit technical tasks.
* Configure programming language.
* Generate interview session.
* Generate candidate invitation link.
* Monitor active sessions.
* Review completed interviews.

3.2. Candidate Workspace

Interface accessible through a unique invitation link.

Features:

* Display interview instructions.
* Display technical task.
* Code editor powered by Monaco.
* Syntax highlighting.
* Basic IntelliSense.
* Code editing.
* Connection status.
* Interview timer.
* Session start/end controls.

The candidate should not need to register an account.

3.3. Interview Monitoring Dashboard

Interface used by the interviewer during an active session.

Main sections:

Code Editor

* Live representation of the candidate’s editor.
* Read-only mode.
* Current code state.
* Programming language.

Activity Timeline

* Chronological list of candidate actions.
* Event timestamps.
* Event details.
* Ability to navigate through historical events.

Session Information

* Candidate connection status.
* Session duration.
* Last activity.
* Browser visibility status.
* Current task.

⸻

4. Code Editor

Use Monaco Editor.

Required functionality

* JavaScript / TypeScript support.
* Syntax highlighting.
* Code formatting.
* IntelliSense.
* Line numbers.
* Multiple themes.
* Configurable editor options.

Editor events

The application should subscribe to Monaco Editor events and relevant browser DOM events.

Important distinction: Monaco model events provide information about document changes, while clipboard and selection events require additional event handlers.

⸻

5. Activity Tracking

One of the most important components of the application.

The system should track candidate interactions with the editor and browser.

5.1. Clipboard Events

COPY

Detect when a candidate copies selected text from the editor.

Capture:

* Timestamp.
* Selected text.
* Text length.
* Selection start/end positions.
* Editor document version.

CUT

Detect when a candidate cuts selected text.

Capture:

* Timestamp.
* Cut text.
* Text length.
* Selection positions.

PASTE

Detect when a candidate pastes content into the editor.

Capture:

* Timestamp.
* Pasted text.
* Text length.
* Cursor position.
* Editor document version.

Important limitations

The browser allows tracking clipboard events occurring inside the application, subject to browser permissions and event handling.

The application cannot reliably determine:

* Where copied text was subsequently pasted.
* Whether the candidate pasted text into ChatGPT or another application.
* What the candidate copied outside the application.
* Which external application was used.

If the candidate copies code from an external editor and pastes it into the interview editor, the application can detect the paste and inspect its contents, but cannot identify the source.

5.2. Selection Tracking

Track text selection inside Monaco Editor.

Capture:

* Selection start/end positions.
* Selected text length.
* Selection timestamp.
* Editor document version.

Potential use cases:

* Understanding which parts of the solution the candidate examines.
* Detecting large selections before copying.
* Correlating selection events with COPY events.

Selection events should be debounced or selectively recorded to avoid generating excessive event volume.

5.3. Text Editing Events

Track document modifications.

Events:

* TEXT_CHANGE
* TEXT_INSERT
* TEXT_DELETE

Capture:

* Timestamp.
* Changed range.
* Inserted/deleted text where available.
* Document version.
* Resulting code snapshot reference.

The system should distinguish ordinary typing from large document changes.

5.4. Browser Activity

Track browser and editor interaction.

Event	Description
EDITOR_FOCUS	Editor receives focus
EDITOR_BLUR	Editor loses focus
TAB_HIDDEN	Browser tab becomes hidden
TAB_VISIBLE	Browser tab becomes visible
WINDOW_FOCUS	Browser window receives focus
WINDOW_BLUR	Browser window loses focus
IDLE	No editor activity for a configured period

These events provide additional context but cannot establish what the candidate is doing outside the browser.

⸻

6. Event Correlation and Analysis

The application should not only record individual events but also provide useful contextual information.

Example:

14:02:10 COPY
  Selected lines: 10-35
  Length: 640 characters
14:02:45 PASTE
  Length: 640 characters
  Content match: 100%

Another example:

14:05:10 TEXT_CHANGE
  Inserted: 12 characters
14:05:15 TEXT_CHANGE
  Inserted: 8 characters
14:05:20 PASTE
  Inserted: 850 characters
14:05:21 CODE_SNAPSHOT
  Document changed significantly

Potential analysis features

* Large paste detection.
* Rapid code insertion detection.
* Copy/paste correlation.
* Significant code changes.
* Long periods of inactivity.
* Frequent browser tab switching.

These indicators should be presented as observations, not definitive evidence of cheating or AI usage.

⸻

7. Real-time Communication

Use NestJS WebSocket Gateway with Socket.IO.

7.1. Session Model

Each interview session represents a separate Socket.IO room.

Example:

interview:session:{sessionId}

Participants:

* Interviewer.
* Candidate.

7.2. Connection Workflow

1. Interviewer creates an interview.
2. Backend creates an interview session.
3. Backend generates a secure invitation token.
4. Candidate opens the invitation link.
5. Candidate authenticates using the session token.
6. Candidate joins the session room.
7. Interviewer joins the same room.
8. Candidate activity is transmitted to the backend.
9. Backend persists events and broadcasts relevant updates to the interviewer.

7.3. WebSocket Events

Candidate -> Backend

Event	Description
session:join	Join interview session
editor:change	Editor content changed
editor:copy	Text copied
editor:cut	Text cut
editor:paste	Text pasted
editor:selection	Text selection changed
editor:focus	Editor focused
editor:blur	Editor lost focus
browser:visibility	Browser visibility changed
session:end	Candidate ends session

Backend -> Interviewer

Event	Description
session:connected	Candidate connected
session:disconnected	Candidate disconnected
editor:updated	Editor content updated
activity:recorded	New activity event
session:status	Session status changed
session:ended	Interview completed

Reliability considerations

* WebSocket reconnection.
* Event acknowledgements.
* Session authorization.
* Duplicate event prevention.
* Event ordering.
* Periodic code snapshots.
* Recovery after temporary disconnection.

The backend should be the source of truth for session state and persisted activity history.

⸻

8. Database Design

Initial Prisma data model.

Interview

id
title
description
createdBy
createdAt
updatedAt

InterviewTask

id
interviewId
title
description
initialCode
language
createdAt
updatedAt

InterviewSession

id
interviewId
candidateName
status
accessTokenHash
startedAt
endedAt
createdAt

ActivityEvent

id
sessionId
eventType
payload
timestamp
sequenceNumber

CodeSnapshot

id
sessionId
documentVersion
content
createdAt

Database considerations

* ActivityEvent should be append-only.
* Use JSONB for event-specific payloads.
* Index events by sessionId and timestamp.
* Store periodic snapshots rather than persisting the entire document after every keystroke.
* Consider snapshot compression for longer interviews.

⸻

9. Security and Privacy

Security is particularly important because the application exposes candidate activity.

Requirements:

* Unique session invitation tokens.
* Expiring session links.
* Secure WebSocket authentication.
* Candidate cannot access other interview sessions.
* Interviewer authorization.
* Server-side validation of all incoming events.
* Rate limiting.
* HTTPS/WSS only.
* Protection against session token reuse.

Privacy considerations

Candidates should be informed about activity tracking before starting an interview.

The application should clearly explain which activities are recorded:

* Copy/cut/paste.
* Text selection.
* Code modifications.
* Editor focus.
* Browser tab visibility.

The application must not claim to monitor external applications or the candidate’s entire computer.

Define a data retention policy for code, clipboard content and activity history.

⸻

10. Development Roadmap

Phase 1 — Basic Interview Workspace (MVP)

Goal: Get a working interview environment.

Tasks:

* Initialize React application.
* Initialize NestJS backend.
* Configure PostgreSQL and Prisma.
* Integrate Monaco Editor.
* Create interview management.
* Create technical tasks.
* Implement interview sessions.
* Generate candidate invitation links.
* Implement Socket.IO Gateway.
* Implement session rooms.
* Implement live code synchronization.
* Build interviewer monitoring dashboard.

Expected result:

Interviewer can create an interview, send a link to a candidate and observe their code in real time.

Phase 2 — Activity Tracking

Goal: Understand how the candidate works on the task.

Tasks:

* Implement COPY detection.
* Implement CUT detection.
* Implement PASTE detection.
* Capture copied/pasted text.
* Implement selection tracking.
* Implement text change tracking.
* Implement editor focus/blur tracking.
* Implement browser visibility tracking.
* Persist activity events.
* Implement activity timeline.
* Implement event correlation.
* Add large paste detection.

Expected result:

Interviewer can see not only the resulting code but also the sequence of actions that led to it.

Phase 3 — Session Replay

Goal: Reconstruct the candidate’s workflow after the interview.

Tasks:

* Implement periodic code snapshots.
* Store editor document versions.
* Implement event timeline navigation.
* Implement historical code reconstruction.
* Implement replay controls.
* Synchronize replay position with activity events.

Expected result:

Interviewer can replay the coding process and inspect the code at any point during the interview.

Phase 4 — Advanced Interview Features

Goal: Expand the platform into a more complete technical interview solution.

Potential features:

* Multiple editor files.
* JavaScript/TypeScript execution.
* Automated test execution.
* Custom test cases.
* Interview notes.
* Interview evaluation and scoring.
* Candidate history.
* Interview templates.
* Multiple programming languages.
* AI-assisted code analysis.

Code execution must run in an isolated sandbox, not directly inside the NestJS backend process.

⸻

11. Suggested NestJS Module Structure

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

Responsibilities:

Module	Responsibility
AuthModule	Authentication and authorization
InterviewsModule	Interview management
TasksModule	Technical task management
SessionsModule	Interview session lifecycle
ActivityModule	Activity event processing and persistence
SnapshotsModule	Code snapshot management
WebSocketModule	Real-time communication

⸻

12. Suggested React Application Structure

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

Two primary application routes:

/interviewer/interviews
/interviewer/sessions/:sessionId
/candidate/session/:token

⸻

13. MVP Acceptance Criteria

The first version is considered functional when:

1. Interviewer can create a technical interview.
2. Interviewer can create and configure a coding task.
3. Interviewer can generate a candidate invitation link.
4. Candidate can join without creating an account.
5. Candidate can write code in Monaco Editor.
6. Interviewer sees code changes in real time.
7. System detects COPY, CUT and PASTE events.
8. System captures selected/copied/pasted text where available.
9. System tracks editor focus and browser visibility.
10. All activity events are persisted.
11. Interviewer can inspect the activity timeline.
12. Session can be completed and reviewed afterwards.

⸻

14. Final Architectural Decisions

For the initial implementation, the following decisions are recommended:

Area	Decision
Frontend architecture	Single React application with role-based routes
Backend architecture	Modular NestJS monolith
Code editor	Monaco Editor
Real-time communication	Socket.IO
Session management	Socket.IO Rooms
Data persistence	PostgreSQL + Prisma
Activity tracking	Browser events + Monaco API
Event storage	Append-only event log
Code history	Periodic snapshots + document versions
Deployment	Static frontend + NestJS backend
Infrastructure	Single backend instance initially

The primary objective of the MVP is to provide a real-time coding interview environment with transparent candidate activity tracking.

Advanced analytics, code execution, AI detection and collaborative editing are explicitly outside the initial MVP scope.

Я бы придерживался именно такого порядка разработки: сначала рабочая сессия и live-синхронизация, затем Activity Tracking, а потом Replay. Это позволит получить полезный инструмент достаточно рано, не перегружая первую версию.

Следующим этапом можно превратить этот план в подробные технические спецификации с DTO, WebSocket-контрактами и Prisma-моделями.