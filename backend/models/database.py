# member-app/backend/models/database.py
from beanie import Document
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
from datetime import datetime

class SplitData(Document):
    """Main collection: splits"""
    splitwise_id: str  # The Splitwise expense ID
    group_id: str      # Splitwise group ID
    group_name: str    # Splitwise group name
    description: str   # Expense description
    total_amount: float
    paid_by: str       # Name of person who paid
    created_by: str    # Who created this expense
    
    # Items data (your existing structure)
    items: List[Dict[str, Any]]  # List of items with name, price, members
    
    # Member splits (name -> amount)
    member_splits: Dict[str, float]
    
    # Metadata
    created_at: datetime
    updated_at: datetime
    
    class Settings:
        name = "splits"  # Collection name in MongoDB


class PendingUpdate(Document):
    """Collection: pending_updates"""
    mongo_split_id: str     # Reference to SplitData._id
    splitwise_expense_id: str  # Reference to Splitwise expense ID
    updated_by_email: str      # Email of member making request
    updated_by_name: str       # Splitwise name of member
    
    # What they want to change
    proposed_changes: List[Dict[str, Any]]  # [{"item_name": "Pizza", "action": "join/leave"}]
    
    status: str = "pending"    # "pending", "approved", "rejected"
    admin_notes: Optional[str] = None
    
    # Metadata
    created_at: datetime
    processed_at: Optional[datetime] = None
    
    class Settings:
        name = "pending_updates"


class MemberMapping(Document):
    """Collection: member_mappings"""
    email: str                 # Member's email (from Clerk auth)
    splitwise_name: str        # Their name in Splitwise
    groups: List[str]          # List of group IDs they belong to
    is_active: bool = True     # Can be used to deactivate members
    
    # Metadata
    created_at: datetime
    updated_at: datetime
    
    class Settings:
        name = "member_mappings"


# Helper models for API responses
class SplitResponse(BaseModel):
    """Response model for API"""
    id: str
    splitwise_id: str
    group_name: str
    description: str
    total_amount: float
    paid_by: str
    items: List[Dict[str, Any]]
    member_splits: Dict[str, float]
    created_at: datetime