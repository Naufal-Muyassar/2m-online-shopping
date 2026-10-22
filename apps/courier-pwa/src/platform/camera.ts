export interface CameraProvider {
  capturePhoto(): Promise<File>;
}
