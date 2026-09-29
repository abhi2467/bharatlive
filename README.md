# BharatLive TV

Three pages: **Home** (live TV player + channel list), **Categories**, **About**.

## Run
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:5000

## Before going public
- Set `CONTACT_EMAIL` in `app.py` so channel owners can reach you (shown on About).
- Only list streams and logos you are authorized to display.
- Serve over HTTPS with a production server (e.g. `gunicorn app:app`).
