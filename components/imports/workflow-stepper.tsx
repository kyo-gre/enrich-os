"use client";

export type StepState = "done" | "current" | "upcoming";

export interface WorkflowStep {
  key: string;
  label: string;
  state: StepState;
}

export function WorkflowStepper({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs">
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
              step.state === "done"
                ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                : step.state === "current"
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
          >
            <span className="font-medium">{i + 1}.</span>
            {step.label}
            {step.state === "done" && <span aria-hidden>✓</span>}
          </span>
          {i < steps.length - 1 && <span className="text-neutral-300 dark:text-neutral-700">→</span>}
        </li>
      ))}
    </ol>
  );
}
