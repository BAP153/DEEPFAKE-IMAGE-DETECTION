import os
import json
import sqlite3
import jwt
import bcrypt
import tempfile
import time
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_cors import CORS
import google.generativeai as genai
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import logging
from PIL import Image
import traceback

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-this')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# JWT configuration
JWT_SECRET = os.getenv('JWT_SECRET', app.config['SECRET_KEY'])
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_DELTA = timedelta(days=7)

# Create necessary folders
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Configure Gemini API
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
model = genai.GenerativeModel('gemini-2.5-flash')

# Database initialization
def init_db():
    """Initialize the database with required tables"""
    conn = sqlite3.connect('deepfake_detector.db')
    c = conn.cursor()
    
    # Users table
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            is_active BOOLEAN DEFAULT 1
        )
    ''')
    
    # Analysis history table
    c.execute('''
        CREATE TABLE IF NOT EXISTS analysis_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            file_name TEXT,
            file_size INTEGER,
            is_ai_generated TEXT,
            confidence REAL,
            explanation TEXT,
            evidence TEXT,
            suggestions TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Initialize database
init_db()

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return jsonify({'error': 'No authorization header'}), 401
        
        try:
            token = auth_header.split(' ')[1]  # Bearer <token>
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            request.user_id = payload['user_id']
            return f(*args, **kwargs)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated_function

# Helper functions
def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def analyze_image_with_gemini(image_path):
    """Analyze image using Gemini Vision API"""
    img = None
    try:
        # Open and prepare the image
        img = Image.open(image_path)
        # Convert to RGB if necessary (for compatibility)
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')
        
        # Create the prompt for deepfake detection
        prompt = """
        Analyze this image and determine if it is AI-generated (deepfake) or a real photograph.
        
        Examine the following aspects:
        1. Lighting consistency and shadows
        2. Texture quality and patterns
        3. Facial features and proportions (if applicable)
        4. Background coherence
        5. Edge artifacts or blending issues
        6. Unrealistic elements or impossible physics
        7. Repetitive patterns typical of AI generation
        8. Color distribution and gradients
        
        You MUST respond with ONLY a valid JSON object in this exact format:
        {
            "is_ai_generated": "yes",
            "confidence": 0.85,
            "evidence": ["example evidence 1", "example evidence 2"],
            "explanation": "brief explanation here",
            "suggested_next_steps": ["suggestion 1", "suggestion 2"]
        }
        
        Rules:
        - is_ai_generated must be exactly one of: "yes", "no", or "undetermined"
        - confidence must be a number between 0.0 and 1.0
        - evidence must be an array of strings
        - explanation must be a string
        - suggested_next_steps must be an array of strings
        
        Return ONLY the JSON object, no other text.
        """
        
        # Generate response with image
        response = model.generate_content([prompt, img])
        
        # Close the image to release the file
        img.close()
        img = None
        
        # Get response text
        response_text = response.text.strip()
        logger.info(f"Gemini response: {response_text[:500]}...")
        
        # Clean up response if it contains markdown code blocks
        if '```json' in response_text:
            start = response_text.find('```json') + 7
            end = response_text.find('```', start)
            if end > start:
                response_text = response_text[start:end].strip()
        elif '```' in response_text:
            import re
            response_text = re.sub(r'```[^`]*```', '', response_text).strip()
        
        # Try to extract JSON if there's extra text
        if '{' in response_text and '}' in response_text:
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            response_text = response_text[start:end]
        
        # Parse JSON
        try:
            result = json.loads(response_text)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing failed. Response text: {response_text}")
            result = {
                "is_ai_generated": "undetermined",
                "confidence": 0.5,
                "evidence": ["Analysis could not be completed due to response format error"],
                "explanation": "The AI model returned an improperly formatted response. Please try again.",
                "suggested_next_steps": ["Try uploading the image again", "Ensure the image is clear and well-lit"]
            }
        
        # Validate and sanitize the response
        validated_result = {
            "is_ai_generated": str(result.get("is_ai_generated", "undetermined")).lower(),
            "confidence": float(result.get("confidence", 0.5)),
            "evidence": result.get("evidence", ["Analysis incomplete"]),
            "explanation": str(result.get("explanation", "Unable to determine")),
            "suggested_next_steps": result.get("suggested_next_steps", ["Try uploading a higher quality image"])
        }
        
        # Ensure is_ai_generated is valid
        if validated_result["is_ai_generated"] not in ["yes", "no", "undetermined"]:
            validated_result["is_ai_generated"] = "undetermined"
        
        # Ensure confidence is between 0 and 1
        validated_result["confidence"] = max(0.0, min(1.0, validated_result["confidence"]))
        
        # Ensure arrays are actually arrays
        if not isinstance(validated_result["evidence"], list):
            validated_result["evidence"] = [str(validated_result["evidence"])]
        if not isinstance(validated_result["suggested_next_steps"], list):
            validated_result["suggested_next_steps"] = [str(validated_result["suggested_next_steps"])]
        
        return validated_result
        
    except Exception as e:
        # Make sure to close the image if it's still open
        if img is not None:
            try:
                img.close()
            except:
                pass
        
        logger.error(f"Gemini API error: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        return {
            "is_ai_generated": "undetermined",
            "confidence": 0.0,
            "evidence": ["Analysis failed"],
            "explanation": f"Error during analysis: {str(e)}",
            "suggested_next_steps": ["Check your internet connection and try again"]
        }

def save_to_user_history(user_id, filename, filesize, result):
    """Save analysis to user's history"""
    try:
        conn = sqlite3.connect('deepfake_detector.db')
        c = conn.cursor()
        
        c.execute('''
            INSERT INTO analysis_history 
            (user_id, file_name, file_size, is_ai_generated, confidence, 
             explanation, evidence, suggestions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            filename,
            filesize,
            result['is_ai_generated'],
            result['confidence'],
            result['explanation'],
            json.dumps(result['evidence']),
            json.dumps(result['suggested_next_steps'])
        ))
        
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error saving to history: {e}")

# Routes
@app.route('/login')
def login_page():
    """Render the login page"""
    return render_template('login.html')

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    """Handle user registration"""
    try:
        data = request.json
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')
        
        # Validation
        if not all([name, email, password]):
            return jsonify({'error': 'All fields are required'}), 400
        
        # Check if user already exists
        conn = sqlite3.connect('deepfake_detector.db')
        c = conn.cursor()
        c.execute('SELECT id FROM users WHERE email = ?', (email,))
        if c.fetchone():
            conn.close()
            return jsonify({'error': 'Email already registered'}), 400
        
        # Hash password
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        
        # Create user
        c.execute('''
            INSERT INTO users (name, email, password)
            VALUES (?, ?, ?)
        ''', (name, email, hashed_password))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Registration successful'
        })
        
    except Exception as e:
        logger.error(f"Registration error: {e}")
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """Handle user login"""
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        remember_me = data.get('rememberMe', False)
        
        # Validation
        if not all([email, password]):
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Demo account check
        if email == 'demo@example.com' and password == 'demo123':
            token_payload = {
                'user_id': 0,
                'email': email,
                'name': 'Demo User',
                'exp': datetime.utcnow() + JWT_EXPIRATION_DELTA
            }
            token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
            
            return jsonify({
                'success': True,
                'token': token,
                'user': {
                    'id': 0,
                    'name': 'Demo User',
                    'email': email
                }
            })
        
        # Check user credentials
        conn = sqlite3.connect('deepfake_detector.db')
        c = conn.cursor()
        c.execute('SELECT id, name, password FROM users WHERE email = ?', (email,))
        user = c.fetchone()
        
        if not user:
            conn.close()
            return jsonify({'error': 'Invalid credentials'}), 401
        
        user_id, name, hashed_password = user
        
        # Verify password
        if not bcrypt.checkpw(password.encode('utf-8'), hashed_password):
            conn.close()
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Update last login
        c.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', (user_id,))
        conn.commit()
        conn.close()
        
        # Generate JWT token
        expiry = JWT_EXPIRATION_DELTA if not remember_me else timedelta(days=30)
        token_payload = {
            'user_id': user_id,
            'email': email,
            'name': name,
            'exp': datetime.utcnow() + expiry
        }
        token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        
        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': user_id,
                'name': name,
                'email': email
            }
        })
        
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'error': 'Login failed'}), 500

@app.route('/api/verify', methods=['GET'])
@login_required
def verify_token():
    """Verify if token is valid"""
    return jsonify({'valid': True, 'user_id': request.user_id})

@app.route('/api/logout', methods=['POST'])
def logout():
    """Handle user logout"""
    return jsonify({'success': True, 'message': 'Logged out successfully'})

@app.route('/analyze', methods=['POST'])
@login_required
def analyze():
    """Handle image upload and analysis - protected route"""
    try:
        # Check if file is present
        if 'image' not in request.files:
            return jsonify({'success': False, 'error': 'No image file provided'}), 400
        
        file = request.files['image']
        
        # Check if file is selected
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # Validate file
        if file and allowed_file(file.filename):
            # Use a temporary directory
            with tempfile.TemporaryDirectory() as temp_dir:
                # Save file securely
                filename = secure_filename(file.filename)
                # Add timestamp to filename to avoid conflicts
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                unique_filename = f"{timestamp}_{filename}"
                filepath = os.path.join(temp_dir, unique_filename)
                
                file.save(filepath)
                logger.info(f"File saved to temp: {filepath}")
                
                # Analyze image
                result = analyze_image_with_gemini(filepath)
                logger.info(f"Analysis result: {result}")
                
                # Get file size before directory is cleaned up
                file_size = os.path.getsize(filepath)
                
                # Save to user's history (only if not demo user)
                if request.user_id != 0:
                    save_to_user_history(request.user_id, file.filename, file_size, result)
                
                # The temporary directory and all its contents will be automatically deleted
                # when exiting the context manager
                
                return jsonify({
                    'success': True,
                    'result': result
                })
        else:
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Please upload an image file (PNG, JPG, JPEG, GIF, or WebP).'
            }), 400
            
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f'Server error: {str(e)}'
        }), 500

@app.route('/api/history', methods=['GET'])
@login_required
def get_user_history():
    """Get user's analysis history"""
    try:
        conn = sqlite3.connect('deepfake_detector.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT id, timestamp, file_name, file_size, is_ai_generated, 
                   confidence, explanation, evidence, suggestions
            FROM analysis_history 
            WHERE user_id = ?
            ORDER BY timestamp DESC 
            LIMIT 50
        ''', (request.user_id,))
        
        history = []
        for row in c.fetchall():
            history.append({
                'id': row[0],
                'timestamp': row[1],
                'fileName': row[2],
                'fileSize': row[3],
                'isAiGenerated': row[4],
                'confidence': row[5],
                'explanation': row[6],
                'evidence': json.loads(row[7]) if row[7] else [],
                'suggestions': json.loads(row[8]) if row[8] else []
            })
        
        conn.close()
        return jsonify({'success': True, 'history': history})
        
    except Exception as e:
        logger.error(f"History fetch error: {e}")
        return jsonify({'error': 'Failed to fetch history'}), 500

@app.route('/test-gemini', methods=['GET'])
def test_gemini():
    """Test Gemini API connection"""
    try:
        response = model.generate_content("Say 'API is working' in JSON format: {\"status\": \"message\"}")
        return jsonify({
            'success': True,
            'response': response.text
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large error"""
    return jsonify({
        'success': False,
        'error': 'File size exceeds maximum allowed size of 16MB'
    }), 413

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal error: {error}")
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

if __name__ == '__main__':
    # Check if API key is set
    if not os.getenv('GEMINI_API_KEY'):
        logger.error("GEMINI_API_KEY not found in environment variables!")
        print("\n⚠️  ERROR: Please set your GEMINI_API_KEY in the .env file")
        print("Get your API key from: https://makersuite.google.com/app/apikey\n")
    else:
        logger.info("Starting Deepfake Detector server...")
        logger.info(f"Upload folder: {app.config['UPLOAD_FOLDER']}")
        logger.info(f"Max file size: {app.config['MAX_CONTENT_LENGTH'] / 1024 / 1024}MB")
        app.run(debug=True, port=5000, host='0.0.0.0')