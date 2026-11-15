import axios from "axios";
import { api, errorMessage } from "./api";

// Fetches a PDF with the session's token and saves it under the server's filename.
export async function downloadPdf(path: string, params?: Record<string, string | undefined>): Promise<void> {
  let res;
  try {
    res = await api.get<Blob>(path, { params, responseType: "blob" });
  } catch (err) {
    // With responseType blob the error body is a Blob too; read it so errorMessage sees the code.
    if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
      try {
        err.response.data = JSON.parse(await err.response.data.text());
      } catch {
        // not JSON: keep the generic message
      }
    }
    throw new Error(errorMessage(err));
  }
  const disposition = String(res.headers["content-disposition"] ?? "");
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "slip.pdf";
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
