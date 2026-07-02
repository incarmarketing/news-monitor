# Legacy Kakao Sender

These scripts are not part of the current production notification path.

Current operations use Slack:

- Daily, weekly, and monthly report notifications: `slack_notify.py`
- Negative-news watch notifications: `negative_watch.py` -> Slack
- Notification history: Supabase `notification_sends`

The Kakao scripts are kept only for recovery reference or temporary manual checks.
Do not add new automation to this folder unless the Kakao channel is intentionally restored.
