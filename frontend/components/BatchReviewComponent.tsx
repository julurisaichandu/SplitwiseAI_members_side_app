// member-app/frontend/components/BatchReviewComponent.tsx
import React, { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import {API_BASE_URL} from "../lib/config";
interface GroupedRequest {
  expense_id: string;
  expense_description: string;
  expense_total: number;
  group_name: string;
  request_count: number;
  requests: PendingUpdate[];
  unique_users: string[];
}

interface PendingUpdate {
  _id: string;
  updated_by_name: string;
  updated_by_email: string;
  proposed_changes: Array<{
    item_name: string;
    action: string;
  }>;
  created_at: string;
}

interface PreviewData {
  expense_id: string;
  expense_description: string;
  expense_total: number;
  original_splits: Record<string, number>;
  new_splits: Record<string, number>;
  member_differences: Record<
    string,
    {
      original_amount: number;
      new_amount: number;
      difference: number;
      percentage_change: number;
    }
  >;
  item_changes: Array<{
    item_name: string;
    original_members: string[];
    new_members: string[];
    added_members: string[];
    removed_members: string[];
    price: number;
    original_split_per_person: number;
    new_split_per_person: number;
    member_count_change: number;
  }>;
  validation: {
    total_matches: boolean;
    original_total: number;
    new_total: number;
    difference: number;
  };
  summary: {
    items_affected: number;
    members_affected: number;
    total_requests: number;
  };
}

const BatchReviewComponent: React.FC = () => {
  const { getToken } = useAuth();
  const [groupedRequests, setGroupedRequests] = useState<GroupedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState<string | null>(null);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(
    new Set()
  );
  const [rejectedRequests, setRejectedRequests] = useState<Set<string>>(
    new Set()
  );
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [workflowStep, setWorkflowStep] = useState<
    "decisions" | "preview" | "completed"
  >("decisions");
  const [processing, setProcessing] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [expenseStatus, setExpenseStatus] = useState<any>(null);
  const [commentPreview, setCommentPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchGroupedRequests();
  }, []);

  useEffect(() => {
    if (selectedExpense) {
      checkExpenseStatus(selectedExpense);
    }
  }, [selectedExpense]);

  const fetchGroupedRequests = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/admin/grouped-pending-requests`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGroupedRequests(data.grouped_requests);
      }
    } catch (error) {
      console.error("Error fetching grouped requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkExpenseStatus = async (expenseId: string) => {
    try {
      const token = await getToken();
      const response = await fetch(
        `${API_BASE_URL}/api/admin/expense-group-status/${expenseId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const status = await response.json();
        setExpenseStatus(status);

        // Determine workflow step based on status
        if (status.workflow_status === "needs_decisions") {
          setWorkflowStep("decisions");
        } else if (status.workflow_status === "ready_for_preview") {
          setWorkflowStep("preview");
        } else if (status.workflow_status === "completed") {
          setWorkflowStep("completed");
        }
      }
    } catch (error) {
      console.error("Error checking expense status:", error);
    }
  };

  const handleExpenseSelect = (expenseId: string) => {
    setSelectedExpense(expenseId);
    setSelectedRequests(new Set());
    setRejectedRequests(new Set());
    setPreview(null);
    setWorkflowStep("decisions");
  };

  const toggleRequestSelection = (
    requestId: string,
    action: "approve" | "reject"
  ) => {
    if (action === "approve") {
      const newSelected = new Set(selectedRequests);
      const newRejected = new Set(rejectedRequests);

      if (newSelected.has(requestId)) {
        newSelected.delete(requestId);
      } else {
        newSelected.add(requestId);
        newRejected.delete(requestId);
      }

      setSelectedRequests(newSelected);
      setRejectedRequests(newRejected);
    } else {
      const newSelected = new Set(selectedRequests);
      const newRejected = new Set(rejectedRequests);

      if (newRejected.has(requestId)) {
        newRejected.delete(requestId);
      } else {
        newRejected.add(requestId);
        newSelected.delete(requestId);
      }

      setSelectedRequests(newSelected);
      setRejectedRequests(newRejected);
    }
  };

  // STEP 1: Commit approval/rejection decisions
  const commitDecisions = async () => {
    if (!selectedExpense) return;

    setProcessing(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/admin/commit-request-decisions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expense_id: selectedExpense,
          approved_request_ids: Array.from(selectedRequests),
          rejected_request_ids: Array.from(rejectedRequests),
          admin_notes: adminNotes,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`✅ Decisions committed successfully!\n${result.message}`);
        setWorkflowStep("preview");
        await checkExpenseStatus(selectedExpense);
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail}`);
      }
    } catch (error) {
      console.error("Error committing decisions:", error);
      alert("❌ Network error occurred");
    } finally {
      setProcessing(false);
    }
  };

  // STEP 2: Preview Splitwise changes
  const previewSplitwiseChanges = async () => {
    if (!selectedExpense) return;

    setProcessing(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/admin/preview-splitwise-changes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expense_id: selectedExpense,
        }),
      });
      if (response.ok) {
        const result = await response.json();
        console.log("Preview response:", result);

        if (result.status === "preview_ready") {
          setPreview(result.preview);
          setCommentPreview(result.comment_preview);
        } else {
          alert(result.message);
        }
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.detail}`);
      }
    } catch (error) {
      console.error("Error generating preview:", error);
      alert("❌ Network error occurred");
    } finally {
      setProcessing(false);
    }
  };

  // STEP 3: Apply to Splitwise and MongoDB
  const applyToSplitwiseAndMongoDB = async () => {
    if (!selectedExpense) return;

    setProcessing(true);
    try {
      const token = await getToken();
      const response = await fetch(
        `${API_BASE_URL}/api/admin/apply-to-splitwise-and-mongodb`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expense_id: selectedExpense,
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        alert(`🎉 SUCCESS!\n${result.message}`);
        setWorkflowStep("completed");
        await checkExpenseStatus(selectedExpense);
        await fetchGroupedRequests(); // Refresh the list
      } else {
        const error = await response.json();
        alert(`❌ CRITICAL ERROR:\n${error.detail}`);
      }
    } catch (error) {
      console.error("Error applying changes:", error);
      alert("❌ Network error occurred");
    } finally {
      setProcessing(false);
    }
  };

  const selectedExpenseData = groupedRequests.find(
    (g) => g.expense_id === selectedExpense
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 border border-purple-200">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          🔄 2-Step Batch Approval Process
        </h2>
        <p className="text-gray-600">
          Step 1: Make decisions → Step 2: Preview changes → Step 3: Update
          Splitwise & Database
        </p>
      </div>

      {/* Workflow Progress Indicator */}
      {selectedExpense && (
        <div className="bg-white rounded-lg shadow-md border p-4">
          <div className="flex items-center justify-between">
            <div
              className={`flex items-center ${
                workflowStep === "decisions"
                  ? "text-blue-600"
                  : "text-green-600"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                  workflowStep === "decisions" ? "bg-blue-600" : "bg-green-600"
                }`}
              >
                {workflowStep === "decisions" ? "1" : "✓"}
              </div>
              <span className="ml-2 font-medium">Make Decisions</span>
            </div>

            <div
              className={`w-16 h-1 ${
                workflowStep !== "decisions" ? "bg-green-600" : "bg-gray-300"
              }`}
            ></div>

            <div
              className={`flex items-center ${
                workflowStep === "preview"
                  ? "text-blue-600"
                  : workflowStep === "completed"
                  ? "text-green-600"
                  : "text-gray-400"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                  workflowStep === "preview"
                    ? "bg-blue-600"
                    : workflowStep === "completed"
                    ? "bg-green-600"
                    : "bg-gray-400"
                }`}
              >
                {workflowStep === "completed" ? "✓" : "2"}
              </div>
              <span className="ml-2 font-medium">Preview Changes</span>
            </div>

            <div
              className={`w-16 h-1 ${
                workflowStep === "completed" ? "bg-green-600" : "bg-gray-300"
              }`}
            ></div>

            <div
              className={`flex items-center ${
                workflowStep === "completed"
                  ? "text-green-600"
                  : "text-gray-400"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                  workflowStep === "completed" ? "bg-green-600" : "bg-gray-400"
                }`}
              >
                {workflowStep === "completed" ? "✓" : "3"}
              </div>
              <span className="ml-2 font-medium">Update Systems</span>
            </div>
          </div>
        </div>
      )}

      {/* Expense Selection */}
      <div className="bg-white rounded-lg shadow-md border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          📊 Expenses with Pending Requests
        </h3>

        {groupedRequests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No grouped requests found
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedRequests.map((group) => (
              <div
                key={group.expense_id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedExpense === group.expense_id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => handleExpenseSelect(group.expense_id)}
              >
                <div className="font-semibold text-sm text-gray-900 mb-2">
                  {group.expense_description}
                </div>
                <div className="text-xs text-gray-600 mb-2">
                  {group.group_name} • ${group.expense_total}
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                    {group.request_count} requests
                  </span>
                  <span className="text-gray-500">
                    {group.unique_users.length} users
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STEP 1: Request Decisions */}
      {selectedExpenseData && workflowStep === "decisions" && (
        <div className="bg-white rounded-lg shadow-md border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            📝 Step 1: Make Approval Decisions for{" "}
            {selectedExpenseData.expense_description}
          </h3>

          <div className="space-y-3 mb-6">
            {selectedExpenseData.requests.map((request) => (
              <div
                key={request._id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium text-gray-900">
                      {request.updated_by_name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {request.updated_by_email}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() =>
                        toggleRequestSelection(request._id, "approve")
                      }
                      className={`px-3 py-1 text-xs rounded ${
                        selectedRequests.has(request._id)
                          ? "bg-green-600 text-white"
                          : "bg-green-100 text-green-800 hover:bg-green-200"
                      }`}
                    >
                      {selectedRequests.has(request._id)
                        ? "✓ Approve"
                        : "Approve"}
                    </button>
                    <button
                      onClick={() =>
                        toggleRequestSelection(request._id, "reject")
                      }
                      className={`px-3 py-1 text-xs rounded ${
                        rejectedRequests.has(request._id)
                          ? "bg-red-600 text-white"
                          : "bg-red-100 text-red-800 hover:bg-red-200"
                      }`}
                    >
                      {rejectedRequests.has(request._id)
                        ? "✓ Reject"
                        : "Reject"}
                    </button>
                  </div>
                </div>

                <div className="text-sm">
                  <strong>Changes:</strong>
                  {request.proposed_changes.map((change, idx) => (
                    <span key={idx} className="ml-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          change.action === "join"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {change.action === "join" ? "➕" : "➖"}{" "}
                        {change.item_name}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Admin Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Admin Notes (Optional)
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Add any notes about these decisions..."
            />
          </div>

          {/* Commit Decisions Button */}
          <div className="flex justify-center">
            <button
              onClick={commitDecisions}
              disabled={
                processing ||
                (selectedRequests.size === 0 && rejectedRequests.size === 0)
              }
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center text-lg font-medium"
            >
              {processing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  Committing Decisions...
                </>
              ) : (
                "✅ Commit Decisions"
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Preview Changes */}
      {selectedExpenseData && workflowStep === "preview" && (
        <div className="bg-white rounded-lg shadow-md border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            👁️ Step 2: Preview Splitwise Changes
          </h3>

          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800">
              Your approval/rejection decisions have been saved. Click "Preview
              Changes" to see exactly what will happen to the Splitwise expense.
            </p>
          </div>

          <div className="flex justify-center mb-6">
            <button
              onClick={previewSplitwiseChanges}
              disabled={processing}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center text-lg font-medium"
            >
              {processing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  Generating Preview...
                </>
              ) : (
                "🔍 Preview Changes"
              )}
            </button>
          </div>

          {preview && (
            <div className="space-y-6">
              {/* Validation Status */}
              <div
                className={`p-4 rounded-lg ${
                  preview.validation.total_matches
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center mb-2">
                  <span
                    className={`text-lg mr-2 ${
                      preview.validation.total_matches
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {preview.validation.total_matches ? "✅" : "❌"}
                  </span>
                  <span
                    className={`font-medium ${
                      preview.validation.total_matches
                        ? "text-green-800"
                        : "text-red-800"
                    }`}
                  >
                    {preview.validation.total_matches
                      ? "Validation Passed"
                      : "Validation Failed"}
                  </span>
                </div>
                <div className="text-sm">
                  <div>
                    Original Total: ${preview.validation.original_total}
                  </div>
                  <div>New Total: ${preview.validation.new_total}</div>
                  {!preview.validation.total_matches && (
                    <div className="text-red-600 font-medium">
                      Difference: ${preview.validation.difference}
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Stats */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">📋 Summary</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {preview.summary.items_affected}
                    </div>
                    <div className="text-blue-700">Items Affected</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {preview.summary.members_affected}
                    </div>
                    <div className="text-blue-700">Members Affected</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {preview.summary.total_requests}
                    </div>
                    <div className="text-blue-700">Total Requests</div>
                  </div>
                </div>
              </div>

              {/* Item Changes */}
              <div>
                <h4 className="font-medium text-gray-800 mb-3">
                  📋 Item Changes
                </h4>
                <div className="space-y-3">
                  {preview.item_changes.map((change, idx) => (
                    <div
                      key={idx}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-gray-900">
                          {change.item_name}
                        </div>
                        <div className="text-sm text-gray-600 font-medium">
                          ${change.price.toFixed(2)}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        {/* Before */}
                        <div>
                          <div className="font-medium text-gray-700 mb-1">
                            Before:
                          </div>
                          <div className="text-gray-600 mb-2">
                            {change.original_members.length} members ($
                            {change.original_split_per_person.toFixed(2)} each)
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {change.original_members.map((member) => (
                              <span
                                key={member}
                                className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                              >
                                {member}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* After */}
                        <div>
                          <div className="font-medium text-gray-700 mb-1">
                            After:
                          </div>
                          <div className="text-gray-600 mb-2">
                            {change.new_members.length} members ($
                            {change.new_split_per_person.toFixed(2)} each)
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {change.new_members.map((member) => (
                              <span
                                key={member}
                                className={`px-2 py-1 rounded text-xs ${
                                  change.added_members.includes(member)
                                    ? "bg-green-100 text-green-800 font-medium"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {change.added_members.includes(member) && "+ "}
                                {member}
                              </span>
                            ))}
                            {change.removed_members.map((member) => (
                              <span
                                key={`removed-${member}`}
                                className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs line-through"
                              >
                                - {member}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Change Summary */}
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            {change.added_members.length > 0 && (
                              <span className="text-green-600 font-medium">
                                +{change.added_members.length} member
                                {change.added_members.length > 1 ? "s" : ""}
                              </span>
                            )}
                            {change.removed_members.length > 0 && (
                              <span className="text-red-600 font-medium ml-2">
                                -{change.removed_members.length} member
                                {change.removed_members.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500">
                            Split change: $
                            {change.original_split_per_person.toFixed(2)} → $
                            {change.new_split_per_person.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Member Split Changes */}
              <div>
                <h4 className="font-medium text-gray-800 mb-3">
                  💰 Member Split Changes
                </h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto border border-gray-200 rounded-lg">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b">
                          Member
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 border-b">
                          Before
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 border-b">
                          After
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 border-b">
                          Change
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-700 border-b">
                          %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(preview.member_differences).map(
                        ([member, diff]) => (
                          <tr
                            key={member}
                            className="border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {member}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              ${diff.original_amount.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              ${diff.new_amount.toFixed(2)}
                            </td>
                            <td
                              className={`px-4 py-3 text-sm text-right font-medium ${
                                diff.difference > 0
                                  ? "text-red-600"
                                  : diff.difference < 0
                                  ? "text-green-600"
                                  : "text-gray-600"
                              }`}
                            >
                              {diff.difference > 0 ? "+" : ""}$
                              {diff.difference.toFixed(2)}
                            </td>
                            <td
                              className={`px-4 py-3 text-xs text-center font-medium ${
                                diff.difference > 0
                                  ? "text-red-600"
                                  : diff.difference < 0
                                  ? "text-green-600"
                                  : "text-gray-600"
                              }`}
                            >
                              {diff.difference !== 0 ? (
                                <span className="px-2 py-1 rounded-full bg-gray-100">
                                  {diff.percentage_change > 0 ? "+" : ""}
                                  {diff.percentage_change}%
                                </span>
                              ) : (
                                <span className="text-gray-400">0%</span>
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">
                  📝 Splitwise Comment Preview
                </h4>

                <div className="bg-white rounded-lg border border-gray-300 p-4 font-mono text-sm whitespace-pre-wrap overflow-x-auto">
                  {commentPreview || "Loading comment preview..."}
                </div>

                <div className="mt-4 flex items-start space-x-2">
                  <div className="text-blue-600">ℹ️</div>
                  <div className="text-sm text-gray-600">
                    <p className="mb-2">
                      <strong>
                        This is how the expense comment will appear in
                        Splitwise.
                      </strong>
                    </p>
                    <p>The comment includes:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      <li>
                        Member-wise breakdown showing which items each person is
                        splitting
                      </li>
                      <li>Individual amounts for each item per member</li>
                      <li>Total amount each member owes</li>
                      <li>
                        Original item data in JSON format for system reference
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center space-x-4 pt-6 border-t">
                <button
                  onClick={() => {
                    setPreview(null);
                    setCommentPreview(null);
                    setWorkflowStep("decisions");
                  }}
                  className="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 flex items-center"
                >
                  ← Go Back to Decisions
                </button>

                <button
                  onClick={applyToSplitwiseAndMongoDB}
                  disabled={processing || !preview.validation.total_matches}
                  className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center text-lg font-medium"
                >
                  {processing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Updating Splitwise & MongoDB...
                    </>
                  ) : (
                    <>
                      🚀 Update Splitwise & MongoDB
                      <span className="ml-2 text-sm">
                        (${preview.validation.new_total})
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Important Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="text-amber-600 text-lg mr-3">⚠️</div>
                  <div>
                    <div className="font-medium text-amber-800 mb-1">
                      Important:
                    </div>
                    <div className="text-amber-700 text-sm">
                      Clicking "Update Splitwise & MongoDB" will permanently
                      modify the Splitwise expense and your database. Make sure
                      you've reviewed all changes carefully before proceeding.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Completed */}
      {workflowStep === "completed" && (
        <div className="bg-white rounded-lg shadow-md border p-6">
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-2xl font-semibold text-green-600 mb-2">
              Batch Approval Completed Successfully!
            </h3>
            <p className="text-gray-600 mb-4">
              All approved changes have been applied to both Splitwise and your
              database.
            </p>
            <button
              onClick={() => {
                setSelectedExpense(null);
                setWorkflowStep("decisions");
                fetchGroupedRequests();
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Process Another Group
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchReviewComponent;
