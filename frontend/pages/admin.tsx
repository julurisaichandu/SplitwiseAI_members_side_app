// member-app/frontend/pages/admin.tsx
import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import AdminDashboard from '../components/AdminDashboard';
import { API_BASE_URL } from '../lib/config';

const AdminPage: React.FC = () => {
  const { getToken } = useAuth();
  const { user, isLoaded } = useUser();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminStatus();
  }, [isLoaded]);

  const checkAdminStatus = async () => {
    try {
      if (!isLoaded) return;
      
      const token = await getToken();
      
      // Make a test API call to check admin status
      const response = await fetch(`${API_BASE_URL}/api/admin/pending-updates`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 403) {
        setIsAdmin(false);
      } else if (response.ok) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('Admin check failed:', error);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg text-center">
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="mb-4">You don't have admin privileges to access this page.</p>
          <a 
            href="/dashboard" 
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
};

export default AdminPage;