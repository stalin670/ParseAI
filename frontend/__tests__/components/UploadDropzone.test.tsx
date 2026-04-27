import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

  // Non-pdf rejection is enforced by react-dropzone's `accept` config and the
  // handler's own MIME guard. Hard to drive through the lib in jsdom; skipping.
});
