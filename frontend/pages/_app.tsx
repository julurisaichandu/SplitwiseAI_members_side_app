// member-app/frontend/pages/_app.tsx
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { ClerkProvider, SignedIn, SignedOut, UserButton, SignInButton, useAuth } from '@clerk/nextjs';
import { useState, useEffect } from 'react';

// Component to check admin status and show admin nav
const AdminNavLink = () => {
  const { getToken } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/pending-updates', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        setIsAdmin(true);
      }
    } catch (error) {
      // Ignore errors, just don't show admin link
    }
  };

  if (!isAdmin) return null;

  return (
    <a 
      href="/admin" 
      className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 hover:bg-blue-100"
    >
      👑 Admin
    </a>
  );
};

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Navigation Header */}
        <SignedIn>
          <nav className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    Splitwise Member Portal
                  </h1>
                </div>
                <div className="flex items-center space-x-4">
                  <a 
                    href="/dashboard" 
                    className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Dashboard
                  </a>
                  <a 
                    href="/my-requests" 
                    className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    My Requests
                  </a>
                  <AdminNavLink />
                  <UserButton afterSignOutUrl="/" />
                </div>
              </div>
            </div>
          </nav>
        </SignedIn>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <SignedIn>
            <Component {...pageProps} />
          </SignedIn>
          
          <SignedOut>
            <div className="text-center py-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Welcome to Splitwise Member Portal
              </h2>
              <p className="text-gray-600 mb-8">
                Please sign in to view your splits and manage your participation in group experiences.
              </p>
              <SignInButton mode="modal">
                <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium">
                  Sign In
                </button>
              </SignInButton>
            </div>
          </SignedOut>
        </main>
      </div>
    </ClerkProvider>
  );
}

export default MyApp;