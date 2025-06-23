// member-app/frontend/components/BulkExpenseMigration.tsx
import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

interface BulkImportResult {
  status: 'success' | 'partial' | 'error';
  message: string;
  total_found: number;
  imported: number;
  already_existed: number;
  failed: number;
  imported_expenses: Array<{
    id: string;
    description: string;
    amount: number;
  }>;
  failed_expenses: Array<{
    id: string;
    error: string;
  }>;
}

const BulkExpenseMigration: React.FC = () => {
  const { getToken } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  // Set default dates (last 30 days)
  React.useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
  }, []);

  const handleBulkImport = async () => {
    if (!startDate || !endDate) {
      alert('Please select both start and end dates');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      alert('Start date must be before end date');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const token = await getToken();
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        group_id: selectedGroup
      });

      const response = await fetch(`/api/bulk-migrate-expenses?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        setResult(data);
      } else {
        setResult({
          status: 'error',
          message: data.detail || 'Bulk import failed',
          total_found: 0,
          imported: 0,
          already_existed: 0,
          failed: 0,
          imported_expenses: [],
          failed_expenses: []
        });
      }
    } catch (error) {
      setResult({
        status: 'error',
        message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        total_found: 0,
        imported: 0,
        already_existed: 0,
        failed: 0,
        imported_expenses: [],
        failed_expenses: []
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅';
      case 'partial': return '⚠️';
      case 'error': return '❌';
      default: return '🔄';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'partial': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const calculateDateRange = () => {
    if (!startDate || !endDate) return '';
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md border p-6">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          📅 Bulk Import by Date Range
        </h3>
        <p className="text-gray-600 text-sm">
          Import multiple expenses from Splitwise within a specific date range
        </p>
      </div>

      {/* Date Range Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Group Filter
          </label>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            <option value="all">All Groups</option>
            <option value="75628383">Testing Group</option>
            <option value="53885029">Muntha masala</option>
            
            {/* Add more groups dynamically if needed */}
          </select>
        </div>
      </div>

      {/* Info Bar */}
      <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex justify-between items-center text-sm">
          <span className="text-blue-700">
            📊 Range: {calculateDateRange()} • Group: {selectedGroup === 'all' ? 'All Groups' : 'Testing Group'}
          </span>
          <span className="text-blue-600 font-medium">
            Only itemized expenses will be imported
          </span>
        </div>
      </div>

      {/* Action Button */}
      <div className="mb-6">
        <button
          onClick={handleBulkImport}
          disabled={isLoading || !startDate || !endDate}
          className="w-full bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center text-lg font-medium"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
              Scanning & Importing Expenses...
            </>
          ) : (
            '🚀 Start Bulk Import'
          )}
        </button>
      </div>

      {/* Results Section */}
      {result && (
        <div className={`p-6 rounded-lg border mb-6 ${getStatusColor(result.status)}`}>
          <div className="flex items-start mb-4">
            <span className="text-2xl mr-3">{getStatusIcon(result.status)}</span>
            <div className="flex-1">
              <h4 className="font-bold text-lg mb-2">
                {result.status === 'success' && 'Bulk Import Completed!'}
                {result.status === 'partial' && 'Partial Import Completed'}
                {result.status === 'error' && 'Bulk Import Failed'}
              </h4>
              <p className="mb-4">{result.message}</p>
              
              {/* Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{result.total_found}</div>
                  <div className="text-sm">Found</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{result.imported}</div>
                  <div className="text-sm">Imported</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{result.already_existed}</div>
                  <div className="text-sm">Already Existed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                  <div className="text-sm">Failed</div>
                </div>
              </div>
            </div>
          </div>

          {/* Successfully Imported Expenses */}
          {result.imported_expenses.length > 0 && (
            <div className="mb-4">
              <h5 className="font-medium mb-2">✅ Successfully Imported ({result.imported_expenses.length})</h5>
              <div className="space-y-1 max-h-40 overflow-y-auto bg-white bg-opacity-50 rounded p-2">
                {result.imported_expenses.map((expense, index) => (
                  <div key={index} className="text-sm flex justify-between">
                    <span>#{expense.id} - {expense.description}</span>
                    <span className="font-medium">${expense.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed Expenses */}
          {result.failed_expenses.length > 0 && (
            <div>
              <h5 className="font-medium mb-2">❌ Failed to Import ({result.failed_expenses.length})</h5>
              <div className="space-y-1 max-h-40 overflow-y-auto bg-white bg-opacity-50 rounded p-2">
                {result.failed_expenses.map((expense, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-medium">#{expense.id}</span>
                    <span className="text-red-600 ml-2">{expense.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Date Presets */}
      <div className="border-t pt-4">
        <h4 className="font-medium text-gray-700 mb-3">🕒 Quick Date Presets</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Last 7 days', days: 7 },
            { label: 'Last 30 days', days: 30 },
            { label: 'Last 3 months', days: 90 },
            { label: 'Last 6 months', days: 180 }
          ].map((preset) => (
            <button
              key={preset.days}
              onClick={() => {
                const end = new Date();
                const start = new Date(end.getTime() - (preset.days * 24 * 60 * 60 * 1000));
                setEndDate(end.toISOString().split('T')[0]);
                setStartDate(start.toISOString().split('T')[0]);
              }}
              className="text-sm bg-gray-100 text-gray-700 px-3 py-2 rounded hover:bg-gray-200 disabled:opacity-50"
              disabled={isLoading}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 className="font-medium text-amber-800 mb-2">💡 Bulk Import Tips</h4>
        <ul className="text-sm text-amber-700 space-y-1">
          <li>• Only expenses with itemized data (created by your main app) will be imported</li>
          <li>• Expenses already in the database will be skipped automatically</li>
          <li>• Large date ranges may take longer to process</li>
          <li>• Failed imports are usually due to missing itemized data</li>
        </ul>
      </div>
    </div>
  );
};

export default BulkExpenseMigration;