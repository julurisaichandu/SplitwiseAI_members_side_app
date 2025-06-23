// member-app/frontend/components/ExpenseMigration.tsx
import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

interface MigrationResult {
  status: 'success' | 'already_exists' | 'error';
  message: string;
  expense_data?: any;
}

const ExpenseMigration: React.FC = () => {
  const { getToken } = useAuth();
  const [expenseId, setExpenseId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [recentMigrations, setRecentMigrations] = useState<string[]>([]);

  const handleMigration = async () => {
    if (!expenseId.trim()) {
      setResult({
        status: 'error',
        message: 'Please enter a valid Splitwise expense ID'
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const token = await getToken();
      const response = await fetch(`/api/migrate-expense?expense_id=${expenseId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        setResult({
          status: data.status === 'already_exists' ? 'already_exists' : 'success',
          message: data.message,
          expense_data: data.expense_data
        });
        
        if (data.status === 'success') {
          setRecentMigrations(prev => [expenseId, ...prev.slice(0, 4)]);
          setExpenseId(''); // Clear input on success
        }
      } else {
        setResult({
          status: 'error',
          message: data.detail || 'Migration failed'
        });
      }
    } catch (error) {
      setResult({
        status: 'error',
        message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅';
      case 'already_exists': return '⚠️';
      case 'error': return '❌';
      default: return '🔄';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'already_exists': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md border p-6">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          📥 Import Splitwise Expense
        </h3>
        <p className="text-gray-600 text-sm">
          Import existing Splitwise expenses into the member portal database
        </p>
      </div>

      {/* Input Section */}
      <div className="mb-6">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Splitwise Expense ID
            </label>
            <input
              type="text"
              value={expenseId}
              onChange={(e) => setExpenseId(e.target.value)}
              placeholder="e.g., 3867079269"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleMigration();
                }
              }}
            />
          </div>
          
          <button
            onClick={handleMigration}
            disabled={isLoading || !expenseId.trim()}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center min-w-[120px] justify-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Importing...
              </>
            ) : (
              'Import'
            )}
          </button>
        </div>
        
        <div className="mt-2 text-sm text-gray-500">
          <p><strong>How to find Expense ID:</strong></p>
          <p>• Go to Splitwise.com → Open the expense → Check URL</p>
          <p>• Example: splitwise.com/api/v3.0/get_expense/<strong>3867079269</strong></p>
        </div>
      </div>

      {/* Result Section */}
      {result && (
        <div className={`p-4 rounded-lg border mb-6 ${getStatusColor(result.status)}`}>
          <div className="flex items-start">
            <span className="text-lg mr-3">{getStatusIcon(result.status)}</span>
            <div className="flex-1">
              <p className="font-medium">
                {result.status === 'success' && 'Import Successful!'}
                {result.status === 'already_exists' && 'Already Exists'}
                {result.status === 'error' && 'Import Failed'}
              </p>
              <p className="text-sm mt-1">{result.message}</p>
              
              {result.expense_data && (
                <div className="mt-3 text-sm">
                  <p><strong>Imported:</strong> {result.expense_data.description}</p>
                  <p><strong>Amount:</strong> ${result.expense_data.total_amount}</p>
                  <p><strong>Items:</strong> {result.expense_data.items?.length || 0}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Migrations */}
      {recentMigrations.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="font-medium text-gray-700 mb-3">Recent Imports</h4>
          <div className="space-y-2">
            {recentMigrations.map((id, index) => (
              <div key={index} className="flex items-center text-sm text-gray-600">
                <span className="w-4 h-4 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs mr-3">
                  ✓
                </span>
                <span>Expense ID: {id}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {index === 0 ? 'Just now' : `${index} import${index > 1 ? 's' : ''} ago`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="border-t pt-4 mt-4">
        <h4 className="font-medium text-gray-700 mb-3">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setExpenseId('')}
            className="text-sm bg-gray-100 text-gray-700 px-3 py-2 rounded hover:bg-gray-200"
          >
            Clear Input
          </button>
          <button
            onClick={() => setResult(null)}
            className="text-sm bg-gray-100 text-gray-700 px-3 py-2 rounded hover:bg-gray-200"
          >
            Clear Result
          </button>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2">💡 Tips</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Import expenses that have itemized data in the comments</li>
          <li>• Members must have matching email mappings to see their splits</li>
          <li>• Already imported expenses will be skipped</li>
          <li>• Press Enter in the input field to quickly import</li>
        </ul>
      </div>
    </div>
  );
};

export default ExpenseMigration;