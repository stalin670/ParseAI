import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadDropzone from "@/components/UploadDropzone";

describe("UploadDropzone", () => {
  it("calls onUpload when a PDF is selected", async () => {
    const onUpload = vi.fn();
    render(<UploadDropzone onUpload={onUpload} />);
    const file = new File(["%PDF-1.4"], "x.pdf", { type: "application/pdf" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("shows error for non-pdf", async () => {
    const onUpload = vi.fn();
    render(<UploadDropzone onUpload={onUpload} />);
    const file = new File(["txt"], "x.txt", { type: "text/plain" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    // Bypass `accept` filter that userEvent honors; we still validate in the handler.
    fireEvent.change(input, { target: { files: [file] } });
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByText(/only pdf/i)).toBeInTheDocument();
  });
});
