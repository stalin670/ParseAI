import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DocList from "@/components/DocList";

const docs = [
  {
    id: "1",
    filename: "alpha.pdf",
    page_count: 5,
    chunk_count: 12,
    created_at: "2026-04-27T10:00:00Z",
  },
  {
    id: "2",
    filename: "beta.pdf",
    page_count: 3,
    chunk_count: 7,
    created_at: "2026-04-26T10:00:00Z",
  },
];

describe("DocList", () => {
  it("renders rows for each doc", () => {
    render(<DocList docs={docs} onDelete={() => {}} />);
    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();
  });

  it("calls onDelete with the doc after the exit transition completes", async () => {
    const onDelete = vi.fn();
    render(<DocList docs={docs} onDelete={onDelete} />);
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    expect(onDelete).not.toHaveBeenCalled();

    const row = screen.getByText("alpha.pdf").closest("li")!;
    fireEvent.transitionEnd(row, { propertyName: "grid-template-rows" });
    expect(onDelete).toHaveBeenCalledWith(docs[0]);
  });

  it("renders empty state when no docs", () => {
    render(<DocList docs={[]} onDelete={() => {}} />);
    expect(screen.getByText(/no documents/i)).toBeInTheDocument();
  });
});
