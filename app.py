from datetime import datetime
from flask import Flask, jsonify, render_template, request
from services.playlist import CATEGORIES, get_channels

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

CONTACT_EMAIL = ''  # e.g. 'hello@yourdomain.com'

@app.context_processor
def inject_globals():
    return {
        'categories': CATEGORIES,
        'year': datetime.now().year,
        'contact_email': CONTACT_EMAIL,
    }

@app.after_request
def security_headers(resp):
    resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resp.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    resp.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
    return resp

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/categories')
def categories():
    return render_template('categories.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/api/channels')
def api_channels():
    try:
        data = get_channels(force=request.args.get('refresh') == '1')
    except Exception:
        return jsonify(success=False, channels=[], error='Channel list is temporarily unavailable.'), 502
    response = jsonify(success=True, count=len(data), channels=data)
    response.headers['Cache-Control'] = 'public, max-age=300, stale-while-revalidate=600'
    return response

@app.errorhandler(404)
@app.errorhandler(500)
def error_page(e):
    code = getattr(e, 'code', 500)
    return render_template('error.html', code=code), code

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)