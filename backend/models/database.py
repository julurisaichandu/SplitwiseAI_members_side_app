# member-app/backend/models/database.py
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel, Field, field_validator
from beanie import Document

class SplitData(Document):
    """Main collection: splits"""
    splitwise_id: str
    group_id: str
    group_name: str
    description: str
    total_amount: float
    paid_by: str
    created_by: str
    items: List[Dict[str, Any]]
    member_splits: Dict[str, float]
    
    # Fix datetime fields to handle MongoDB format
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    
    @field_validator('created_at', 'updated_at', mode='before')
    def parse_datetime(cls, v):
        if isinstance(v, dict) and '$date' in v:
            # Handle MongoDB extended JSON format
            date_str = v['$date']
            if isinstance(date_str, str):
                return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return v
    
    class Settings:
        name = "splits"  # or "splitwise_ai.splits" if you didn't rename

class PendingUpdate(Document):
    """Collection: pending_updates"""
    mongo_split_id: str
    splitwise_expense_id: str
    updated_by_email: str
    updated_by_name: str
    proposed_changes: List[Dict[str, Any]]
    status: str = "pending"
    admin_notes: Optional[str] = None
    
    # Fix datetime fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None
    
    @field_validator('created_at', 'processed_at', mode='before')
    def parse_datetime(cls, v):
        if isinstance(v, dict) and '$date' in v:
            date_str = v['$date']
            if isinstance(date_str, str):
                return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return v
    
    class Settings:
        name = "pending_updates"  # or "splitwise_ai.pending_updates"

class MemberMapping(Document):
    """Collection: member_mappings"""
    email: str
    splitwise_name: str
    groups: List[str]
    is_active: bool = True
    
    # Fix datetime fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    
    @field_validator('created_at', 'updated_at', mode='before')
    def parse_datetime(cls, v):
        if isinstance(v, dict) and '$date' in v:
            date_str = v['$date']
            if isinstance(date_str, str):
                return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return v
    
    class Settings:
        name = "member_mappings"  # or "splitwise_ai.member_mappings"

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