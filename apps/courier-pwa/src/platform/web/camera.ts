import type { CameraProvider } from "../camera";

export const webCamera: CameraProvider = {
  capturePhoto: () =>
    new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) resolve(file);
        else reject(new Error("No photo selected"));
      };
      input.click();
    }),
};
