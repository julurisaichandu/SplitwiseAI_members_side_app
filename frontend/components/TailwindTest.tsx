// member-app/frontend/components/TailwindTest.tsx
import React from 'react';

const TailwindTest: React.FC = () => {
  return (
    <div className="bg-red-500 text-white p-4 rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold mb-2">Tailwind CSS Test</h1>
      <p className="text-sm">If you see a red background, Tailwind is working!</p>
      <button className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
        Test Button
      </button>
    </div>
  );
};

export default TailwindTest;