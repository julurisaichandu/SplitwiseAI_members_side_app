# Configure CORS for local network access
import requests
from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import datetime
import os
import json
from dotenv import load_dotenv
import uuid
# Import database models and connection
from database.connection import connect_to_mongo, close_mongo_connection
from models.database import SplitData, PendingUpdate, MemberMapping
from auth.clerk import verify_clerk_token, get_current_user
from beanie.operators import In
from splitwise.expense import ExpenseUser

load_dotenv()

app = FastAPI(title="Splitwise Member App", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Member app frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for requests
class UpdateRequest(BaseModel):
    split_id: str
    item_name: str
    action: str  # "join" or "leave"

class ApprovalRequest(BaseModel):
    update_id: str
    action: str  # "approve" or "reject"
    admin_notes: Optional[str] = None

# Event handlers
@app.on_event("startup")
async def startup_event():
    await connect_to_mongo()

@app.on_event("shutdown") 
async def shutdown_event():
    await close_mongo_connection()

@app.get("/")
def root():
    return {"message": "Splitwise Member App API"}

# Get current user's accessible splits
@app.get("/api/member/splits")
async def get_member_splits(current_user: dict = Depends(get_current_user)):
    """Get all splits accessible to current user"""
    try:
        print(f"🔍 Looking for member mapping for email: {current_user['email']}")
        
        # Get user's group memberships
        member_mapping = await MemberMapping.find_one(
            MemberMapping.email == current_user["email"]
        )
        
        if not member_mapping:
            print(f"❌ Member mapping not found for {current_user['email']}")
            
            # In development mode, provide helpful error message
            if os.getenv("NODE_ENV") == "development":
                # List all existing member mappings for debugging
                all_mappings = await MemberMapping.find().to_list()
                existing_emails = [m.email for m in all_mappings]
                print(f"🔍 Existing member mappings: {existing_emails}")
                
                return {
                    "error": "Member mapping not found",
                    "message": f"No member mapping found for email: {current_user['email']}",
                    "suggestion": "Add a member mapping in MongoDB with this email",
                    "existing_mappings": existing_emails,
                    "user_info": current_user
                }
            
            raise HTTPException(status_code=404, detail="Member mapping not found. Please contact admin.")
        
        print(f"✅ Found member mapping for {member_mapping.splitwise_name}")
        
        # Get splits for user's groups - Fixed query
        splits = await SplitData.find(
            In(SplitData.group_id, member_mapping.groups)
        ).to_list()
        
        print(f"🔍 Found {len(splits)} splits for groups: {member_mapping.groups}")
        
        return {
            "splits": splits,
            "member_name": member_mapping.splitwise_name,
            "groups": member_mapping.groups
        }
        
    except Exception as e:
        print(f"❌ Error in get_member_splits: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Get specific split details
@app.get("/api/member/splits/{split_id}")
async def get_split_details(split_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed view of a specific split"""
    try:
        # Get user's member mapping
        member_mapping = await MemberMapping.find_one(
            MemberMapping.email == current_user["email"]
        )
        
        if not member_mapping:
            raise HTTPException(status_code=404, detail="Member mapping not found")
        
        # Get the split
        split = await SplitData.get(split_id)
        if not split:
            raise HTTPException(status_code=404, detail="Split not found")
        
        # Check if user has access to this split
        if split.group_id not in member_mapping.groups:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return {
            "split": split,
            "member_name": member_mapping.splitwise_name
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Request to join/leave an item
@app.post("/api/member/request-update")
async def request_update(
    request_data: dict,
    current_user: dict = Depends(get_current_user)  # Changed to match your other functions
):
    """Submit a request to update split participation - FIXED VERSION"""
    
    split_id = request_data.get("split_id")
    item_name = request_data.get("item_name")
    action = request_data.get("action")
    
    # Get user info - Use dictionary access like your other functions
    user_email = current_user["email"]  # This is how you access it in other functions
    
    # Get user name from member mapping (consistent with your other functions)
    member_mapping = await MemberMapping.find_one(
        MemberMapping.email == user_email
    )
    
    if not member_mapping:
        raise HTTPException(status_code=404, detail="Member mapping not found")
    
    user_name = member_mapping.splitwise_name
    
    # Get split info using Beanie model (not raw pymongo)
    split = await SplitData.get(split_id)
    if not split:
        raise HTTPException(status_code=404, detail="Split not found")
    
    # Check if user has access to this split
    if split.group_id not in member_mapping.groups:
        raise HTTPException(status_code=403, detail="Access denied to this split")
    
    # Create new pending update using Beanie model
    pending_update = PendingUpdate(
        mongo_split_id=split_id,
        splitwise_expense_id=split.splitwise_id,
        updated_by_email=user_email,
        updated_by_name=user_name,
        proposed_changes=[{
            "item_name": item_name,
            "action": action
        }],
        status="pending",
        created_at=datetime.utcnow()
    )
    
    # Save using Beanie (async)
    await pending_update.insert()
    
    return {
        "status": "success", 
        "message": f"Request submitted for '{action}' on '{item_name}'"
    }

# Get user's pending requests
@app.get("/api/member/my-requests")
async def get_my_requests(current_user: dict = Depends(get_current_user)):
    """Get current user's pending update requests"""
    try:
        requests = await PendingUpdate.find(
            PendingUpdate.updated_by_email == current_user["email"]
        ).to_list()
        
        return {"requests": requests}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Admin endpoints (for approval)
@app.get("/api/admin/pending-updates")
async def get_pending_updates(current_user: dict = Depends(get_current_user)):
    """Get all pending update requests (admin only)"""
    try:
        # Check if user is admin (you can customize this logic)
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        pending_updates = await PendingUpdate.find(
            PendingUpdate.status == "pending"
        ).to_list()
        
        return {"updates": pending_updates}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/approve-update")
async def approve_update(
    request: ApprovalRequest,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject an update request (admin only) - FIXED to update Splitwise first"""
    try:
        # Check if user is admin
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get the pending update
        pending_update = await PendingUpdate.get(request.update_id)
        if not pending_update:
            raise HTTPException(status_code=404, detail="Update request not found")
        
        # If rejecting, just update the status in MongoDB
        if request.action == "reject":
            pending_update.status = "rejected"
            pending_update.admin_notes = request.admin_notes
            pending_update.processed_at = datetime.utcnow()
            await pending_update.save()
            return {"status": "success", "message": "Request rejected successfully"}
        
        # If approving, we need to update Splitwise first
        if request.action == "approve":
            print(f"🔄 Processing approval for request {request.update_id}")
            
            # Get the split data
            split = await SplitData.get(pending_update.mongo_split_id)
            if not split:
                raise HTTPException(status_code=404, detail="Original split not found")
            
            # Apply the proposed changes to the split data
            updated_split = split.copy(deep=True)
            for change in pending_update.proposed_changes:
                item_name = change["item_name"]
                action = change["action"]
                
                # Find the item and update members
                for item in updated_split.items:
                    if item["name"] == item_name:
                        if action == "join" and pending_update.updated_by_name not in item["members"]:
                            item["members"].append(pending_update.updated_by_name)
                        elif action == "leave" and pending_update.updated_by_name in item["members"]:
                            item["members"].remove(pending_update.updated_by_name)
            
            # Recalculate member splits
            updated_split.member_splits = calculate_member_splits(updated_split.items)
            
            # First, try to update Splitwise
            try:
                print(f"📤 Updating Splitwise expense {split.splitwise_id}")
                # splitwise_success = False
                splitwise_success = await update_splitwise_expense_api(
                    split.splitwise_id,
                    updated_split.items,
                    updated_split.member_splits,
                    split.total_amount,
                    split.paid_by,
                    split.description,
                    split.group_id
                )
                
                if splitwise_success:
                    print("✅ Splitwise updated successfully")
                    
                    # Update MongoDB with the new data
                    split.items = updated_split.items
                    split.member_splits = updated_split.member_splits
                    split.updated_at = datetime.utcnow()
                    await split.save()
                    
                    # Update the pending request status
                    pending_update.status = "applied_to_splitwise"
                    pending_update.admin_notes = request.admin_notes
                    pending_update.processed_at = datetime.utcnow()
                    await pending_update.save()
                    
                    return {
                        "status": "success", 
                        "message": "Request approved and applied to both Splitwise and MongoDB"
                    }
                else:
                    print("❌ Splitwise update failed")
                    # Mark the request with a different status to indicate Splitwise failure
                    # pending_update.status = "splitwise_failed"
                    # pending_update.admin_notes = f"Splitwise update failed. {request.admin_notes or ''}"
                    # pending_update.processed_at = datetime.utcnow()
                    # await pending_update.save()
                    
                    # raise HTTPException(
                    #     status_code=500,
                    #     detail="Failed to update Splitwise. Request marked as failed."
                    # )
                    
            except Exception as e:
                print(f"❌ Error updating Splitwise: {str(e)}")
                # Mark the request with error status
                pending_update.status = "splitwise_error"
                pending_update.admin_notes = f"Error: {str(e)}. {request.admin_notes or ''}"
                pending_update.processed_at = datetime.utcnow()
                await pending_update.save()
                
                raise HTTPException(
                    status_code=500,
                    detail=f"Error updating Splitwise: {str(e)}"
                )
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"❌ Unexpected error in approve_update: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Helper function to update Splitwise (implementing the incomplete function)
async def update_splitwise_expense_api(
    expense_id: str,
    items: List[Dict[str, Any]],
    member_splits: Dict[str, float],
    total_amount: float,
    paid_by: str,
    description: str,
    group_id: str
) -> bool:
    """Update Splitwise expense with new split data"""
    try:
        # Import Splitwise
        try:
            from splitwise import Splitwise
            from splitwise.expense import Expense, ExpenseUser
        except ImportError:
            print("❌ Splitwise library not installed")
            return False
        
        # Get Splitwise credentials
        SPLITWISE_CONSUMER_KEY = os.getenv("SPLITWISE_CONSUMER_KEY")
        SPLITWISE_SECRET_KEY = os.getenv("SPLITWISE_SECRET_KEY")
        SPLITWISE_API_KEY = os.getenv("SPLITWISE_API_KEY")
        
        if not all([SPLITWISE_CONSUMER_KEY, SPLITWISE_SECRET_KEY, SPLITWISE_API_KEY]):
            print("❌ Splitwise credentials not configured")
            return False
        
        # Initialize Splitwise client
        sObj = Splitwise(SPLITWISE_CONSUMER_KEY, SPLITWISE_SECRET_KEY, api_key=SPLITWISE_API_KEY)
        
        # Build member name to ID mapping
        user = sObj.getCurrentUser()
        friends = sObj.getFriends()
        
        mem_to_id = {}
        mem_to_id[user.first_name] = user.id
        for friend in friends:
            mem_to_id[friend.first_name] = friend.id
        
        print(f"🔍 Available members: {list(mem_to_id.keys())}")
        
        # Create expense object for update
        expense = Expense()
        expense.setId(int(expense_id))
        expense.setCost(str(total_amount))
        expense.setDescription(description)
        expense.setGroupId(int(group_id))
        
        # Create updated comment
        temp_split_data = SplitData(
            splitwise_id=expense_id,
            group_id=group_id,
            group_name="",
            description=description,
            total_amount=total_amount,
            paid_by=paid_by,
            created_by="",
            items=items,
            member_splits=member_splits,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        comment = create_updated_comment(temp_split_data)
        expense.setDetails(comment)
        
        # Create users list
        users = []
        
        # Create payer first
        if paid_by in mem_to_id:
            payer = ExpenseUser()
            payer.setId(mem_to_id[paid_by])
            payer.setPaidShare(str(total_amount))
            
            # Set payer's owed share
            if paid_by in member_splits:
                payer.setOwedShare(str(member_splits[paid_by]))
            else:
                payer.setOwedShare('0')
            
            users.append(payer)
            print(f"✅ Added payer: {paid_by} - Paid: ${total_amount}, Owes: ${member_splits.get(paid_by, 0)}")
        else:
            print(f"❌ ERROR: Payer '{paid_by}' not found in Splitwise!")
            return False
        
        # Add other members who owe money
        for member_name, amount in member_splits.items():
            if amount == 0 or member_name == paid_by:
                continue
            
            if member_name in mem_to_id:
                debtor = ExpenseUser()
                debtor.setId(mem_to_id[member_name])
                debtor.setPaidShare('0')
                debtor.setOwedShare(str(amount))
                users.append(debtor)
                print(f"✅ Added debtor: {member_name} - Owes: ${amount}")
            else:
                print(f"⚠️ WARNING: Member '{member_name}' not found in Splitwise! Skipping...")
        
        # Set users on expense
        expense.setUsers(users)
        
        print(f"📤 Updating expense with {len(users)} users")
        
        # Update the expense
        result, errors = sObj.updateExpense(expense)
        
        if errors:
            print(f"❌ Splitwise update errors: {errors}")
            return False
        
        if result:
            print(f"✅ Splitwise expense {expense_id} updated successfully")
            return True
        else:
            print(f"❌ Failed to update Splitwise expense {expense_id}")
            return False
            
    except Exception as e:
        print(f"❌ Error in update_splitwise_expense_api: {str(e)}")
        return False

# Helper function to calculate member splits
def calculate_member_splits(items: List[Dict[str, Any]]) -> Dict[str, float]:
    """Calculate how much each member owes based on items"""
    member_totals = {}
    
    for item in items:
        if len(item["members"]) > 0:
            split_amount = item["price"] / len(item["members"])
            for member in item["members"]:
                if member not in member_totals:
                    member_totals[member] = 0
                member_totals[member] += split_amount
    
    # Round to 2 decimal places
    return {member: round(amount, 2) for member, amount in member_totals.items()}

def parse_expense_comment(comment: str):
    """Parse the JSON data from Splitwise comment"""
    try:
        if "---ITEMDATA---" in comment:
            # Split and get the JSON part
            parts = comment.split("---ITEMDATA---")
            if len(parts) > 1:
                json_data = parts[1].strip()
                return json.loads(json_data)
    except Exception as e:
        print(f"Error parsing comment JSON: {e}")
    return None

# ADD MIGRATION ENDPOINT for importing Splitwise expenses
@app.post("/api/migrate-expense")
async def migrate_existing_expense(
    expense_id: int = Query(..., description="Splitwise expense ID to import"),
    current_user: dict = Depends(get_current_user)
):
    """Migrate existing Splitwise expense to MongoDB (admin only)"""
    try:
        # Check if user is admin
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")

        # Import Splitwise libraries
        try:
            from splitwise import Splitwise
            from splitwise.expense import Expense, ExpenseUser
        except ImportError:
            raise HTTPException(status_code=500, detail="Splitwise library not installed")

        # Get Splitwise credentials from environment
        SPLITWISE_CONSUMER_KEY = os.getenv("SPLITWISE_CONSUMER_KEY")
        SPLITWISE_SECRET_KEY = os.getenv("SPLITWISE_SECRET_KEY") 
        SPLITWISE_API_KEY = os.getenv("SPLITWISE_API_KEY")
        
        if not all([SPLITWISE_CONSUMER_KEY, SPLITWISE_SECRET_KEY, SPLITWISE_API_KEY]):
            raise HTTPException(status_code=500, detail="Splitwise credentials not configured")

        # Initialize Splitwise client
        sObj = Splitwise(SPLITWISE_CONSUMER_KEY, SPLITWISE_SECRET_KEY, api_key=SPLITWISE_API_KEY)
        
        # Get expense from Splitwise
        exp_obj = sObj.getExpense(expense_id)
        if not exp_obj:
            raise HTTPException(status_code=404, detail="Expense not found in Splitwise")
        
        # Get group name
        groups = sObj.getGroups()
        group_name = None
        for group in groups:
            if group.id == exp_obj.getGroupId():
                group_name = group.name
                break
        
        # Parse comment for item data
        comment = exp_obj.getDetails()
        item_data = parse_expense_comment(comment)
        
        if not item_data:
            raise HTTPException(
                status_code=400, 
                detail="No itemized data found in expense comment. This expense may not have been created with the itemized bill splitter."
            )
        
        # Build member splits from expense users
        member_splits = {}
        paid_by = "Unknown"
        for user in exp_obj.getUsers():
            member_splits[user.getFirstName()] = float(user.getOwedShare())
            # Find who paid the most (likely the payer)
            if float(user.getPaidShare()) > 0:
                paid_by = user.getFirstName()
        
        # Check if already exists
        existing = await SplitData.find_one(SplitData.splitwise_id == str(expense_id))
        if existing:
            return {
                "status": "already_exists", 
                "message": f"Expense {expense_id} already imported",
                "expense_data": {
                    "description": existing.description,
                    "total_amount": existing.total_amount,
                    "items": existing.items
                }
            }
        
        # Create document
        split_doc = SplitData(
            splitwise_id=str(expense_id),
            group_id=str(exp_obj.getGroupId()),
            group_name=group_name or "Unknown Group",
            description=exp_obj.getDescription(),
            total_amount=float(exp_obj.getCost()),
            paid_by=paid_by,
            created_by=current_user["email"],
            items=item_data,
            member_splits=member_splits,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        await split_doc.insert()
        
        print(f"✅ Successfully migrated expense {expense_id} to database")
        
        return {
            "status": "success", 
            "message": f"Successfully imported expense {expense_id}",
            "expense_data": {
                "description": exp_obj.getDescription(),
                "total_amount": float(exp_obj.getCost()),
                "items": item_data,
                "group_name": group_name
            }
        }
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"❌ Migration error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")
        
        # # Initialize Splitwise client
        # sObj = Splitwise(SPLITWISE_CONSUMER_KEY, SPLITWISE_SECRET_KEY, api_key=SPLITWISE_API_KEY)
        
        # # Get current user info for member mapping
        # user = sObj.getCurrentUser()
        # friends = sObj.getFriends()
        
        # # Build member to ID mapping
        # mem_to_id = {user.first_name: user.id}
        # for friend in friends:
        #     mem_to_id[friend.first_name] = friend.id
        
        # # Create updated expense object
        # expense = Expense()
        # expense.setId(int(split_data.splitwise_id))
        # expense.setCost(str(split_data.total_amount))
        # expense.setDescription(split_data.description)
        
        # # Create updated comment with new item data
        # updated_comment = f"EXPENSE_ID:{split_data.splitwise_id}\n{split_data.description} (Updated by {updated_by})\n---ITEMDATA---\n{json.dumps(split_data.items)}"
        # expense.setDetails(updated_comment)
        
        # # Set group ID
        # expense.setGroupId(int(split_data.group_id))
        
        # # Create users with updated splits
        # users = []
        
        # # Find who paid (assume it's the same as before)
        # paid_by = split_data.paid_by
        # total_amount = split_data.total_amount
        
        # # Create payer
        # if paid_by in mem_to_id:
        #     payer = ExpenseUser()
        #     payer.setId(mem_to_id[paid_by])
        #     payer.setPaidShare(str(total_amount))
        #     payer.setOwedShare(str(split_data.member_splits.get(paid_by, 0)))
        #     users.append(payer)
        
        # # Create other users
        # for member_name, owed_amount in split_data.member_splits.items():
        #     if member_name != paid_by and owed_amount > 0 and member_name in mem_to_id:
        #         user_obj = ExpenseUser()
        #         user_obj.setId(mem_to_id[member_name])
        #         user_obj.setPaidShare('0')
        #         user_obj.setOwedShare(str(owed_amount))
        #         users.append(user_obj)
        
        # expense.setUsers(users)
        
        # # Update the expense in Splitwise
        # result, errors = sObj.updateExpense(expense)
        
        # if errors:
        #     print(f"❌ Splitwise update errors: {errors}")
        #     return False
        # else:
        #     print(f"✅ Successfully updated Splitwise expense {split_data.splitwise_id}")
        #     return True
            
    except Exception as e:
        print(f"❌ Error updating Splitwise: {str(e)}")
        return False


# Add this endpoint to your existing backend main.py or routes file

@app.post("/api/bulk-migrate-expenses")
async def bulk_migrate_expenses(
    start_date: str = Query(...),
    end_date: str = Query(...),
    group_id: str = Query("all"),
    current_user: dict = Depends(get_current_user)
):
    """Bulk import expenses from Splitwise within date range"""
    
    # Check admin permission
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        # Initialize Splitwise client properly
        SPLITWISE_CONSUMER_KEY = os.getenv("SPLITWISE_CONSUMER_KEY")
        SPLITWISE_SECRET_KEY = os.getenv("SPLITWISE_SECRET_KEY")
        SPLITWISE_API_KEY = os.getenv("SPLITWISE_API_KEY")
        
        if not all([SPLITWISE_CONSUMER_KEY, SPLITWISE_SECRET_KEY, SPLITWISE_API_KEY]):
            raise HTTPException(status_code=500, detail="Splitwise credentials not configured")

        from splitwise import Splitwise
        sObj = Splitwise(SPLITWISE_CONSUMER_KEY, SPLITWISE_SECRET_KEY, api_key=SPLITWISE_API_KEY)
        
        # Get all groups for name mapping
        groups = sObj.getGroups()
        group_id_to_name = {str(g.id): g.name for g in groups}
        
        # Get expenses for date range
        # Note: The Splitwise SDK might have a different method for this
        # You might need to use sObj.getExpenses() with parameters
        expenses = sObj.getExpenses(
            dated_after=start_date,
            dated_before=end_date,
            limit=0
        )
        
        # Filter by group if specified
        if group_id != "all":
            expenses = [e for e in expenses if str(e.getGroupId()) == group_id]
        
        # Initialize results
        results = {
            "total_found": len(expenses),
            "imported": 0,
            "already_existed": 0,
            "failed": 0,
            "imported_expenses": [],
            "failed_expenses": []
        }
        
        # Process each expense
        for expense in expenses:
            expense_id = str(expense.getId())
            
            # Check if already exists
            existing = await SplitData.find_one(SplitData.splitwise_id == expense_id)
            if existing:
                results["already_existed"] += 1
                continue
            
            try:
                # Get the comment/details
                comment = expense.getDetails()
                
                # Use the SAME parse function as single migrate!
                item_data = parse_expense_comment(comment)
                
                if not item_data:
                    results["failed"] += 1
                    results["failed_expenses"].append({
                        "id": expense_id,
                        "error": "No itemized data found in comment"
                    })
                    continue
                
                # Build member splits from expense users
                member_splits = {}
                paid_by = "Unknown"
                
                for user in expense.getUsers():
                    if float(user.getOwedShare()) > 0:
                        member_splits[user.getFirstName()] = float(user.getOwedShare())
                    
                    # Find who paid
                    if float(user.getPaidShare()) > 0:
                        paid_by = user.getFirstName()
                
                # Get group name
                group_name = group_id_to_name.get(str(expense.getGroupId()), "Unknown Group")
                
                # Create split document
                split_doc = SplitData(
                    splitwise_id=expense_id,
                    group_id=str(expense.getGroupId()),
                    group_name=group_name,
                    description=expense.getDescription(),
                    total_amount=float(expense.getCost()),
                    paid_by=paid_by,
                    created_by=current_user["email"],
                    items=item_data,  # From parse_expense_comment
                    member_splits=member_splits,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                
                # Insert using Beanie
                await split_doc.insert()
                
                results["imported"] += 1
                results["imported_expenses"].append({
                    "id": expense_id,
                    "description": expense.getDescription(),
                    "amount": float(expense.getCost())
                })
                
            except Exception as e:
                results["failed"] += 1
                results["failed_expenses"].append({
                    "id": expense_id,
                    "error": str(e)
                })
        
        # Determine status
        if results["imported"] > 0 and results["failed"] == 0:
            status = "success"
            message = f"Successfully imported {results['imported']} expenses"
        elif results["imported"] > 0 and results["failed"] > 0:
            status = "partial"
            message = f"Imported {results['imported']} expenses, {results['failed']} failed"
        elif results["imported"] == 0 and results["already_existed"] > 0:
            status = "success"
            message = f"All {results['already_existed']} expenses already existed"
        else:
            status = "error"
            message = "No expenses were imported"
        
        return {
            "status": status,
            "message": message,
            **results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk import failed: {str(e)}")
@app.post("/api/admin/commit-request-decisions")
async def commit_request_decisions(
    request_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Step 1: Commit admin's approve/reject decisions to database"""
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        expense_id = request_data.get("expense_id")
        approved_request_ids = request_data.get("approved_request_ids", [])
        rejected_request_ids = request_data.get("rejected_request_ids", [])
        admin_notes = request_data.get("admin_notes", "")
        
        processed_time = datetime.utcnow()
        
        # Update approved request statuses ONLY
        approved_count = 0
        for request_id in approved_request_ids:
            request = await PendingUpdate.get(request_id)
            if request and request.splitwise_expense_id == expense_id:
                request.status = "approved"  # Approved but not yet applied to Splitwise
                request.admin_notes = admin_notes
                request.processed_at = processed_time
                await request.save()
                approved_count += 1
        
        # Update rejected request statuses
        rejected_count = 0
        for request_id in rejected_request_ids:
            request = await PendingUpdate.get(request_id)
            if request and request.splitwise_expense_id == expense_id:
                request.status = "rejected"
                request.admin_notes = admin_notes
                request.processed_at = processed_time
                await request.save()
                rejected_count += 1
        
        return {
            "status": "success",
            "message": f"Decisions committed: {approved_count} approved, {rejected_count} rejected",
            "approved_count": approved_count,
            "rejected_count": rejected_count,
            "next_step": "Click 'Update Group' to preview Splitwise changes"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def calculate_batch_changes(split_data: SplitData, requests: List[PendingUpdate]) -> dict:
    """Calculate the preview of changes for batch approval"""
    
    # Deep copy original data to avoid modifying the original
    original_items = copy.deepcopy(split_data.items)
    new_items = copy.deepcopy(split_data.items)
    
    # Track changes for preview
    item_changes = []
    affected_members = set()
    
    # Apply all requested changes to new_items
    for request in requests:
        for change in request.proposed_changes:
            item_name = change["item_name"]
            action = change["action"]
            member_name = request.updated_by_name
            
            affected_members.add(member_name)
            
            # Find the item in new_items
            for item_idx, item in enumerate(new_items):
                if item["name"] == item_name:
                    original_members = set(original_items[item_idx]["members"])
                    current_members = set(item["members"])
                    
                    if action == "join" and member_name not in current_members:
                        new_items[item_idx]["members"].append(member_name)
                        current_members.add(member_name)
                    elif action == "leave" and member_name in current_members:
                        new_items[item_idx]["members"].remove(member_name)
                        current_members.remove(member_name)
                    
                    # Track the change for this item
                    item_change = {
                        "item_name": item_name,
                        "original_members": list(original_members),
                        "new_members": list(current_members),
                        "added_members": list(current_members - original_members),
                        "removed_members": list(original_members - current_members),
                        "price": item["price"],
                        "original_split_per_person": item["price"] / len(original_members) if original_members else 0,
                        "new_split_per_person": item["price"] / len(current_members) if current_members else 0,
                        "member_count_change": len(current_members) - len(original_members)
                    }
                    
                    # Check if we already have a change record for this item
                    existing_change = None
                    for existing in item_changes:
                        if existing["item_name"] == item_name:
                            existing_change = existing
                            break
                    
                    if existing_change:
                        # Update existing change record
                        existing_change.update(item_change)
                    else:
                        # Add new change record
                        item_changes.append(item_change)
                    
                    break
    
    # Calculate original and new member splits
    original_splits = calculate_member_splits(original_items)
    new_splits = calculate_member_splits(new_items)
    
    # Calculate differences for each member
    all_members = set(original_splits.keys()) | set(new_splits.keys()) | affected_members
    member_differences = {}
    
    for member in all_members:
        original_amount = original_splits.get(member, 0)
        new_amount = new_splits.get(member, 0)
        difference = new_amount - original_amount
        
        member_differences[member] = {
            "original_amount": round(original_amount, 2),
            "new_amount": round(new_amount, 2),
            "difference": round(difference, 2),
            "percentage_change": round((difference / original_amount * 100) if original_amount > 0 else 0, 1) if difference != 0 else 0
        }
    
    # Validation
    original_total = sum(original_splits.values())
    new_total = sum(new_splits.values())
    total_matches = abs(original_total - new_total) < 0.01  # Allow for small floating point differences
    
    return {
        "expense_id": split_data.splitwise_id,
        "expense_description": split_data.description,
        "expense_total": split_data.total_amount,
        "original_splits": {k: round(v, 2) for k, v in original_splits.items()},
        "new_splits": {k: round(v, 2) for k, v in new_splits.items()},
        "member_differences": member_differences,
        "item_changes": item_changes,
        "affected_members": list(affected_members),
        "validation": {
            "total_matches": total_matches,
            "original_total": round(original_total, 2),
            "new_total": round(new_total, 2),
            "difference": round(new_total - original_total, 2)
        },
        "summary": {
            "items_affected": len(item_changes),
            "members_affected": len(affected_members),
            "total_requests": len(requests)
        }
    }

# STEP 2: Preview what the Splitwise changes will be (based on approved requests)
@app.post("/api/admin/preview-splitwise-changes")
async def preview_splitwise_changes(
    request_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Step 2: Preview the actual Splitwise changes based on approved requests"""
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        expense_id = request_data.get("expense_id")
        
        print(f"🔍 Previewing changes for expense {expense_id} based on approved requests")
        # Get the split data
        split_data = await SplitData.find_one(SplitData.splitwise_id == expense_id)
        if not split_data:
            raise HTTPException(status_code=404, detail="Expense not found")
        
        # Get ONLY approved requests (not pending anymore)
        approved_requests = await PendingUpdate.find(
            PendingUpdate.splitwise_expense_id == expense_id,
            PendingUpdate.status == "approved"
        ).to_list()
        
        if not approved_requests:
            return {
                "status": "no_changes",
                "message": "No approved requests found for this expense",
                "approved_requests_count": 0
            }
        
        # Calculate the preview
        preview = calculate_batch_changes(split_data, approved_requests)
        # Calculate the final split data to generate comment preview
        updated_split_data = await calculate_final_split_data(split_data, approved_requests)
        
        # Generate the comment preview
        comment_preview = create_updated_comment(updated_split_data)
        
        print(f"🔍 Preview calculated for {len(approved_requests)} approved requests")
        return {
            "status": "preview_ready",
            "message": f"Preview ready for {len(approved_requests)} approved requests",
            "approved_requests_count": len(approved_requests),
            "preview": preview,
            "comment_preview": comment_preview, 
            "next_step": "Click 'Update Splitwise & MongoDB' to apply changes"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    


async def calculate_final_split_data(original_split_data: SplitData, approved_requests: List[PendingUpdate]) -> SplitData:
    """Calculate the final split data after applying approved changes, without saving to database"""
    
    # Create a copy of the original data
    updated_split_data = copy.deepcopy(original_split_data)
    
    # Apply all approved changes
    for request in approved_requests:
        for change in request.proposed_changes:
            item_name = change["item_name"]
            action = change["action"]
            member_name = request.updated_by_name
            
            # Apply change to items
            for item in updated_split_data.items:
                if item["name"] == item_name:
                    if action == "join" and member_name not in item["members"]:
                        item["members"].append(member_name)
                    elif action == "leave" and member_name in item["members"]:
                        item["members"].remove(member_name)
                    break
    
    # Recalculate member splits
    updated_split_data.member_splits = calculate_member_splits(updated_split_data.items)
    
    return updated_split_data


def create_updated_comment(split_data: SplitData) -> str:
    """Create updated comment with member-wise splits and item data for Splitwise"""
    try:
        comment_parts = []
        
        # NEW SECTION: Add member-wise item splits at the top
        comment_parts.append("=== MEMBER SPLITS BY ITEM ===")
        comment_parts.append("")  # Empty line for spacing
        
        # Calculate member-wise item splits
        member_item_splits = {}
        
        # Build a dict of member -> [(item_name, split_amount), ...]
        for item in split_data.items:
            if item["members"]:  # Only if there are members
                split_per_person = item["price"] / len(item["members"])
                for member in item["members"]:
                    if member not in member_item_splits:
                        member_item_splits[member] = []
                    member_item_splits[member].append({
                        "name": item["name"],
                        "amount": split_per_person
                    })
        
        # Format member splits nicely
        for member_name in sorted(member_item_splits.keys()):
            items = member_item_splits[member_name]
            # Sort items by name for consistency
            items.sort(key=lambda x: x["name"])
            
            # Format: Member --> item1 ($X.XX), item2 ($Y.YY)
            items_str = ", ".join([f"{item['name']} (${item['amount']:.2f})" for item in items])
            total_for_member = sum(item['amount'] for item in items)
            
            comment_parts.append(f"{member_name} --> {items_str}")
            comment_parts.append(f"   Total: ${total_for_member:.2f}")
            comment_parts.append("")  # Empty line between members
        
        comment_parts.append("="*40)  # Separator
        comment_parts.append("")  # Empty line
        
        # EXISTING SECTION: Keep all the existing comment parts
        comment_parts.extend([
            f"EXPENSE_ID:{split_data.splitwise_id}",
            f"{split_data.description} (Updated via Batch Approval)",
            f"Updated at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC",
            "---ITEMDATA---"
        ])
        
        # Add JSON item data (existing functionality)
        item_data = []
        for item in split_data.items:
            item_data.append({
                "name": item["name"],
                "price": item["price"],
                "members": item["members"]
            })
        
        comment_parts.append(json.dumps(item_data, indent=2))
        
        return "\n".join(comment_parts)
        
    except Exception as e:
        print(f"❌ Error creating updated comment: {str(e)}")
        return f"{split_data.description} (Updated via Batch Approval)"

def create_updated_users(split_data: SplitData, member_to_id: Dict[str, int]) -> List[ExpenseUser]:
    """Create updated user objects for Splitwise expense"""
    try:
        
        users = []
        
        # Find who paid the most (assume they are the payer)
        paid_by = split_data.paid_by
        total_amount = split_data.total_amount
        
        # Create all users who owe money
        for member_name, owed_amount in split_data.member_splits.items():
            if owed_amount > 0 and member_name in member_to_id:
                user = ExpenseUser()
                user.setId(member_to_id[member_name])
                
                # Set payment details
                if member_name == paid_by:
                    user.setPaidShare(str(total_amount))  # Payer paid the full amount
                    user.setOwedShare(str(owed_amount))   # But only owes their share
                else:
                    user.setPaidShare('0')                # Others paid nothing
                    user.setOwedShare(str(owed_amount))   # But owe their share
                
                users.append(user)
                print(f"🔍 Created user: {member_name} (ID: {member_to_id[member_name]}) - Owes: ${owed_amount}")
        
        # Validation: Check if totals match
        total_owed = sum(float(user.getOwedShare()) for user in users)
        total_paid = sum(float(user.getPaidShare()) for user in users)
        
        print(f"🔍 Validation - Total owed: ${total_owed}, Total paid: ${total_paid}, Expense total: ${total_amount}")
        
        if abs(total_owed - total_amount) > 0.01:
            print(f"⚠️ Warning: Total owed (${total_owed}) doesn't match expense total (${total_amount})")
        
        if abs(total_paid - total_amount) > 0.01:
            print(f"⚠️ Warning: Total paid (${total_paid}) doesn't match expense total (${total_amount})")
        
        return users
        
    except Exception as e:
        print(f"❌ Error creating updated users: {str(e)}")
        return []
    
    
async def update_splitwise_expense_batch(split_data: SplitData) -> bool:
    """Update Splitwise expense with batch changes"""
    try:
        print(f"🔄 Updating Splitwise expense {split_data.splitwise_id} with batch changes")
        
        # Get Splitwise credentials
        SPLITWISE_CONSUMER_KEY = os.getenv("SPLITWISE_CONSUMER_KEY")
        SPLITWISE_SECRET_KEY = os.getenv("SPLITWISE_SECRET_KEY") 
        SPLITWISE_API_KEY = os.getenv("SPLITWISE_API_KEY")
        
        if not all([SPLITWISE_CONSUMER_KEY, SPLITWISE_SECRET_KEY, SPLITWISE_API_KEY]):
            print("❌ Splitwise credentials not configured")
            return False

        # Import Splitwise libraries
        try:
            from splitwise import Splitwise
            from splitwise.expense import Expense, ExpenseUser
        except ImportError:
            print("❌ Splitwise library not installed")
            return False

        # Initialize Splitwise client
        sObj = Splitwise(SPLITWISE_CONSUMER_KEY, SPLITWISE_SECRET_KEY, api_key=SPLITWISE_API_KEY)
        
        # Get current user info and friends for member mapping
        current_user = sObj.getCurrentUser()
        friends = sObj.getFriends()
        
        # Build member name to Splitwise ID mapping
        member_to_id = {}
        member_to_id[current_user.first_name] = current_user.id
        for friend in friends:
            member_to_id[friend.first_name] = friend.id
        
        print(f"🔍 Available Splitwise members: {list(member_to_id.keys())}")
        
        # Create updated expense object
        expense = Expense()
        expense.setId(int(split_data.splitwise_id))
        expense.setCost(str(split_data.total_amount))
        expense.setDescription(split_data.description)
        expense.setGroupId(int(split_data.group_id))
        
        # Create updated comment with new item data
        updated_comment = create_updated_comment(split_data)
        expense.setDetails(updated_comment)
        
        # Create users with updated splits
        users = []
        
        # Add payer
        if split_data.paid_by in member_to_id:
            payer = ExpenseUser()
            payer.setId(member_to_id[split_data.paid_by])
            payer.setPaidShare(str(split_data.total_amount))
            
            if split_data.paid_by in split_data.member_splits:
                payer.setOwedShare(str(split_data.member_splits[split_data.paid_by]))
            else:
                payer.setOwedShare('0')
            
            users.append(payer)
            print(f"✅ Added payer: {split_data.paid_by}")
        else:
            print(f"❌ ERROR: Payer '{split_data.paid_by}' not found!")
            return False
        
        # Add other members
        for member_name, owed_amount in split_data.member_splits.items():
            if owed_amount > 0 and member_name != split_data.paid_by:
                if member_name in member_to_id:
                    user = ExpenseUser()
                    user.setId(member_to_id[member_name])
                    user.setPaidShare('0')
                    user.setOwedShare(str(owed_amount))
                    users.append(user)
                    print(f"✅ Added member: {member_name} - Owes: ${owed_amount}")
                else:
                    print(f"⚠️ WARNING: Member '{member_name}' not found! Skipping...")
        
        if not users:
            print("❌ No valid users created for Splitwise update")
            return False
        
        expense.setUsers(users)
        
        print(f"🔍 Updating expense with {len(users)} users")
        
        # Update the expense in Splitwise
        result, errors = sObj.updateExpense(expense)
        
        if errors:
            print(f"❌ Splitwise update errors: {errors}")
            return False
        else:
            print(f"✅ Successfully updated Splitwise expense {split_data.splitwise_id}")
            return True
            
    except Exception as e:
        print(f"❌ Error updating Splitwise expense: {str(e)}")
        return False
      
# STEP 3: Actually apply changes to Splitwise and MongoDB
@app.post("/api/admin/apply-to-splitwise-and-mongodb")
async def apply_to_splitwise_and_mongodb(
    request_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Step 3: Apply approved changes to Splitwise first, then MongoDB"""
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        expense_id = request_data.get("expense_id")
        
        # Get split data
        split_data = await SplitData.find_one(SplitData.splitwise_id == expense_id)
        if not split_data:
            raise HTTPException(status_code=404, detail="Expense not found")
        
        # Get approved requests that haven't been applied yet
        approved_requests = await PendingUpdate.find(
            PendingUpdate.splitwise_expense_id == expense_id,
            PendingUpdate.status == "approved"  # Approved but not yet applied
        ).to_list()
        
        if not approved_requests:
            return {
                "status": "no_changes",
                "message": "No approved requests to apply"
            }
        
        # Calculate final split data
        updated_split_data = await calculate_final_split_data(split_data, approved_requests)
        
        # STEP 3A: Update Splitwise FIRST
        print(f"🔄 Step 3A: Updating Splitwise expense {expense_id}")
        splitwise_success = await update_splitwise_expense_batch(updated_split_data)
        # testing
        # splitwise_success = True
        
        if not splitwise_success:
            raise HTTPException(
                status_code=500,
                detail="Failed to update Splitwise. No changes made to prevent inconsistency."
            )
        
        print(f"✅ Step 3A Complete: Splitwise updated successfully")
        
        # STEP 3B: Update MongoDB (only after Splitwise success)
        try:
            print(f"🔄 Step 3B: Updating MongoDB")
            
            split_data.items = updated_split_data.items
            split_data.member_splits = updated_split_data.member_splits
            split_data.updated_at = datetime.utcnow()
            await split_data.save()
            
            print(f"✅ Step 3B Complete: MongoDB updated successfully")
            
            # STEP 3C: Mark requests as fully completed
            for request in approved_requests:
                request.status = "applied_to_splitwise"  # New status: fully completed
                await request.save()
            
            print(f"✅ Step 3C Complete: {len(approved_requests)} requests marked as applied")
            
            return {
                "status": "success",
                "message": f"Successfully applied {len(approved_requests)} approved requests to Splitwise and MongoDB",
                "applied_requests_count": len(approved_requests),
                "splitwise_updated": True,
                "mongodb_updated": True,
                "completion_time": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            # Critical: Splitwise updated but MongoDB failed
            print(f"🚨 CRITICAL: Splitwise updated but MongoDB failed for expense {expense_id}")
            
            # Mark requests with critical error status
            for request in approved_requests:
                request.status = "splitwise_updated_mongodb_failed"
                request.admin_notes += f" | CRITICAL ERROR: {str(e)}"
                await request.save()
            
            raise HTTPException(
                status_code=500,
                detail=f"CRITICAL: Splitwise updated but MongoDB failed. Manual intervention required: {str(e)}"
            )
            
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Helper endpoint: Get current status of expense group
@app.get("/api/admin/expense-group-status/{expense_id}")
async def get_expense_group_status(
    expense_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get current status of all requests for an expense group"""
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get all requests for this expense
        all_requests = await PendingUpdate.find(
            PendingUpdate.splitwise_expense_id == expense_id
        ).to_list()
        
        # Group by status
        status_counts = {}
        for request in all_requests:
            status = request.status
            status_counts[status] = status_counts.get(status, 0) + 1
        
        # Get split data
        split_data = await SplitData.find_one(SplitData.splitwise_id == expense_id)
        
        return {
            "expense_id": expense_id,
            "expense_description": split_data.description if split_data else "Unknown",
            "total_requests": len(all_requests),
            "status_breakdown": status_counts,
            "can_preview": status_counts.get("approved", 0) > 0,
            "can_apply": status_counts.get("approved", 0) > 0,
            "has_critical_errors": status_counts.get("splitwise_updated_mongodb_failed", 0) > 0,
            "workflow_status": determine_workflow_status(status_counts)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def determine_workflow_status(status_counts: dict) -> str:
    """Determine what step the admin should take next"""
    if status_counts.get("pending", 0) > 0:
        return "needs_decisions"  # Step 1: Make approve/reject decisions
    elif status_counts.get("approved", 0) > 0:
        return "ready_for_preview"  # Step 2: Preview changes
    elif status_counts.get("applied_to_splitwise", 0) > 0:
        return "completed"  # All done
    elif status_counts.get("splitwise_updated_mongodb_failed", 0) > 0:
        return "critical_error"  # Needs manual intervention
    else:
        return "no_pending_requests"


from typing import List, Dict, Any
from collections import defaultdict
import copy

# Pydantic models for batch processing
class BatchApprovalRequest(BaseModel):
    request_ids: List[str]  # List of pending update IDs to approve
    admin_notes: Optional[str] = None

class PreviewCalculation(BaseModel):
    expense_id: str
    original_splits: Dict[str, float]
    new_splits: Dict[str, float]
    items_changes: List[Dict[str, Any]]
    total_amount: float
    affected_members: List[str]

# Get grouped pending requests by expense
@app.get("/api/admin/grouped-pending-requests")
async def get_grouped_pending_requests(current_user: dict = Depends(get_current_user)):
    """Get pending requests grouped by splitwise expense ID"""
    try:
        # Check admin permission
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get all pending requests
        pending_requests = await PendingUpdate.find(
            PendingUpdate.status == "pending"
        ).to_list()
        
        # Group by splitwise_expense_id
        grouped_requests = defaultdict(list)
        for request in pending_requests:
            grouped_requests[request.splitwise_expense_id].append(request)
        
        # Format response with expense details
        result = []
        for expense_id, requests in grouped_requests.items():
            # Get expense details from SplitData
            split_data = await SplitData.find_one(SplitData.splitwise_id == expense_id)
            
            if split_data:
                result.append({
                    "expense_id": expense_id,
                    "expense_description": split_data.description,
                    "expense_total": split_data.total_amount,
                    "group_name": split_data.group_name,
                    "request_count": len(requests),
                    "requests": requests,
                    "unique_users": list(set([req.updated_by_name for req in requests]))
                })
        
        return {"grouped_requests": result}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

# Health check
@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/api/admin/check-data-consistency")
async def check_data_consistency(current_user: dict = Depends(get_current_user)):
    """Check if all data follows first-name-only convention"""
    try:
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        issues = []
        
        # Check MemberMapping
        mappings = await MemberMapping.find_all().to_list()
        for m in mappings:
            if " " in m.splitwise_name:
                issues.append({
                    "type": "MemberMapping",
                    "id": str(m.id),
                    "field": "splitwise_name",
                    "value": m.splitwise_name,
                    "issue": "Contains space (should be first name only)"
                })
        
        # Check SplitData
        splits = await SplitData.find_all().to_list()
        for s in splits:
            if " " in s.paid_by:
                issues.append({
                    "type": "SplitData",
                    "id": str(s.id),
                    "field": "paid_by",
                    "value": s.paid_by,
                    "issue": "Contains space (should be first name only)"
                })
            
            for member in s.member_splits.keys():
                if " " in member:
                    issues.append({
                        "type": "SplitData",
                        "id": str(s.id),
                        "field": "member_splits key",
                        "value": member,
                        "issue": "Contains space (should be first name only)"
                    })
        
        return {
            "total_issues": len(issues),
            "issues": issues,
            "summary": {
                "member_mappings_checked": len(mappings),
                "splits_checked": len(splits)
            },
            "recommendation": "Run data migration if issues found" if issues else "All data is consistent!"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))