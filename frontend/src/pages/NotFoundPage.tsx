import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="That route isn't part of the operations console."
      hint={
        <Link to="/" className="text-accent hover:underline">
          Back to the overview
        </Link>
      }
    />
  );
}
