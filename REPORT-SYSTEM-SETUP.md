# FindIt Report System: setup

## 1. Copy files
Unzip into the repo root (`findit/`). It adds:
- `services/report-service/`        new microservice (Express + MongoDB)
- `frontend/src/api/reports.js`
- `frontend/src/components/reports/` (ReportModal, ReportButton, StatusBadge, Timeline)
- `frontend/src/pages/reports/`      (MyReports, ReportDetail, AdminReports, reportUtils)
- `frontend/src/styles/reports.css`

## 2. docker-compose.yml: add a service
```yaml
  report-service:
    build: ./services/report-service
    env_file: ./services/report-service/.env
    environment:
      MONGO_URI: mongodb://mongo:27017/findit_reports   # use your mongo service name
    volumes:
      - report_uploads:/app/uploads/reports
    expose: ["4100"]
    restart: unless-stopped
# and under top-level volumes:
#   report_uploads:
```
Copy `.env.example` to `.env` in `services/report-service/` and set `JWT_SECRET`
to the SAME secret your auth service signs tokens with.

## 3. Gateway: proxy two paths to report-service:4100
- `/api/reports`   -> http://report-service:4100/api/reports
- `/uploads/reports` -> http://report-service:4100/uploads/reports

Example with http-proxy-middleware:
```js
app.use('/api/reports', createProxyMiddleware({ target: 'http://report-service:4100', changeOrigin: true }));
app.use('/uploads/reports', createProxyMiddleware({ target: 'http://report-service:4100', changeOrigin: true }));
```
If you use nginx (frontend/nginx.conf), add matching `location` blocks and set
`client_max_body_size 16m;` so 3 screenshots can upload.

## 4. Frontend routes (react-router-dom v6)
```jsx
import MyReports from './pages/reports/MyReports';
import ReportDetail from './pages/reports/ReportDetail';
import AdminReports from './pages/reports/AdminReports';

<Route path="/reports" element={<MyReports />} />
<Route path="/reports/:id" element={<ReportDetail />} />
<Route path="/admin/reports" element={<AdminRoute><AdminReports /></AdminRoute>} />
```
Wrap the admin route in whatever admin guard you already have. The server also
enforces the role, so the guard is only for UX.

## 5. Add the Report button
```jsx
import ReportButton from './components/reports/ReportButton';
<ReportButton type="item" id={item._id} label={item.title} />   // item card / detail
<ReportButton type="claim" id={claim._id} label="Claim on Black wallet" />
<ReportButton type="user" id={user._id} label={user.name} />
<ReportButton type="message" id={msg._id} />
<ReportButton type="general">Report a problem</ReportButton>      // Settings page
```
Settings page: add a link to `/reports` ("My reports") next to the Language field.

## 6. Notifications
Default: notifications are saved by report-service. Your bell icon can read
`GET /api/reports/notifications` and `PATCH /api/reports/notifications/read`.
If you already have a notification service, set `NOTIFICATION_URL` and adapt
the request body in `services/report-service/src/utils/notify.js`.

## 7. Assumptions to check
- JWT in `Authorization: Bearer` header, token in `localStorage.token`
  (change `getToken()` in `frontend/src/api/reports.js`)
- JWT payload has `id` (or `_id`/`sub`) and `role` ('admin' or 'moderator' for staff)
  (change in `middleware/auth.js`)
- Screenshot URLs are unguessable random names. For stricter privacy, put
  `/uploads/reports` behind an authenticated route.
