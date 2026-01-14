import { Card } from "@/components/ui/card";

export default function UserManagementPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">User Management</h1>
        <p className="text-stone-600 mt-1">
          Add users, assign roles, and manage access permissions.
        </p>
      </header>

      <Card title="User Directory">
        <p className="text-stone-600">
          This section will display all users, their roles, and access levels.
        </p>
      </Card>

    </div>
  );
}