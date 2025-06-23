# member-app/backend/auth/clerk.py
import os
import jwt
from fastapi import HTTPException, Header
from typing import Optional
import requests
import json

def verify_clerk_token(authorization: str = Header(None)) -> dict:
    """Verify Clerk JWT token"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    try:
        # Remove 'Bearer ' prefix
        token = authorization.replace("Bearer ", "")
        
        # DEVELOPMENT MODE - Skip verification for easier testing
        if os.getenv("NODE_ENV") == "development":
            print("🚧 DEVELOPMENT MODE: Skipping JWT verification")
            # Decode without verification for development
            decoded = jwt.decode(token, options={"verify_signature": False})
            print(f"🔍 Decoded token keys: {list(decoded.keys())}")
            return decoded
        
        # PRODUCTION MODE - Proper JWT verification
        CLERK_PEM_PUBLIC_KEY = os.getenv("CLERK_PEM_PUBLIC_KEY")
        CLERK_JWT_AUDIENCE = os.getenv("CLERK_JWT_AUDIENCE")
        
        if not CLERK_PEM_PUBLIC_KEY:
            raise HTTPException(status_code=500, detail="Clerk public key not configured for production")
        
        decoded = jwt.decode(
            token,
            CLERK_PEM_PUBLIC_KEY,
            algorithms=["RS256"],
            audience=CLERK_JWT_AUDIENCE
        )
        
        return decoded
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

async def get_user_from_clerk_api(user_id: str, token: str) -> dict:
    """Fetch user details from Clerk API"""
    try:
        # Clerk API endpoint to get user details
        clerk_api_url = f"https://api.clerk.com/v1/users/{user_id}"
        
        # We need the secret key for Clerk API
        clerk_secret = os.getenv("CLERK_SECRET_KEY")
        if not clerk_secret:
            print("❌ CLERK_SECRET_KEY not found in environment")
            return None
            
        headers = {
            "Authorization": f"Bearer {clerk_secret}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(clerk_api_url, headers=headers)
        
        if response.status_code == 200:
            user_data = response.json()
            print(f"✅ Fetched user data from Clerk API: {user_data.get('email_addresses', [])}")
            return user_data
        else:
            print(f"❌ Clerk API error: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error fetching from Clerk API: {str(e)}")
        return None

async def get_current_user(authorization: str = Header(None)) -> dict:
    """Get current user from Clerk token"""
    print("🔍 get_current_user called")
    
    try:
        decoded_token = verify_clerk_token(authorization)
        print("🔍 Token verified successfully")
        
        user_id = decoded_token.get("sub")
        print(f"🔍 User ID: {user_id}")
        
        # First try to get email from token
        user_email = None
        if decoded_token.get("email"):
            user_email = decoded_token.get("email")
        elif decoded_token.get("email_addresses") and len(decoded_token.get("email_addresses")) > 0:
            user_email = decoded_token.get("email_addresses")[0].get("email_address")
        elif decoded_token.get("primaryEmailAddress"):
            user_email = decoded_token.get("primaryEmailAddress").get("emailAddress")
        
        print(f"🔍 Email from token: {user_email}")
        
        # If no email in token, try Clerk API
        if not user_email:
            print("🔍 No email in token, trying Clerk API...")
            token_raw = authorization.replace("Bearer ", "")
            clerk_user_data = await get_user_from_clerk_api(user_id, token_raw)
            
            if clerk_user_data and clerk_user_data.get("email_addresses"):
                # Get the primary email
                email_addresses = clerk_user_data.get("email_addresses", [])
                primary_email = next((addr for addr in email_addresses if addr.get("id") == clerk_user_data.get("primary_email_address_id")), None)
                
                if primary_email:
                    user_email = primary_email.get("email_address")
                    print(f"✅ Got email from Clerk API: {user_email}")
                elif email_addresses:
                    user_email = email_addresses[0].get("email_address")
                    print(f"✅ Got first email from Clerk API: {user_email}")
        
        # If still no email, use fallback in development
        if not user_email:
            if os.getenv("NODE_ENV") == "development":
                print(f"⚠️ No email found anywhere, using development fallback for user {user_id}")
                user_email = f"dev-user-{user_id[-6:]}@example.com"
            else:
                raise HTTPException(status_code=401, detail="User email not found")
        
        print(f"🔍 Final email: {user_email}")
        
        # Check if user is admin
        admin_emails = os.getenv("ADMIN_EMAILS", "").split(",")
        is_admin = user_email.strip() in [email.strip() for email in admin_emails if email.strip()]
        print(f"🔍 Is admin: {is_admin}")
        
        result = {
            "email": user_email,
            "user_id": user_id,
            "is_admin": is_admin,
            "token_data": decoded_token
        }
        print(f"🔍 Returning user: {result}")
        return result
        
    except HTTPException as e:
        print(f"❌ HTTPException in get_current_user: {e.detail}")
        raise e
    except Exception as e:
        print(f"❌ Unexpected error in get_current_user: {str(e)}")
        raise HTTPException(status_code=401, detail=f"User authentication failed: {str(e)}")