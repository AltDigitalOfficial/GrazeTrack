import { Card } from "@/components/ui/card";

export default function UploadSOPPage() {
  return (
    <div className="p-6 space-y-6">

      <header>
        <h1 className="text-3xl font-bold text-stone-800">Upload SOP</h1>
        <p className="text-stone-600 mt-1">
          Upload a PDF, Word document, or reference file to your SOP library.
        </p>
      </header>

      <Card title="Upload Document">
        <p className="text-stone-600">
          A file upload interface will appear here for adding SOP documents.
        </p>
      </Card>

    </div>
  );
}