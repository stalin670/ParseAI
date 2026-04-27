import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatWindow from "@/components/ChatWindow";

describe("ChatWindow", () => {
  it("renders existing messages and submits a new one", async () => {
    const onSend = vi.fn();
    render(
      <ChatWindow
        messages={[{ role: "user", content: "hi" }]}
        sources={[]}
        streaming={false}
        onSend={onSend}
      />,
    );
    expect(screen.getByText("hi")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/ask/i), "what is X?{Enter}");
    expect(onSend).toHaveBeenCalledWith("what is X?");
  });
});
