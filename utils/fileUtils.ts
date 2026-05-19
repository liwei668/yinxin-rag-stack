export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  filename?: string;
  url?: string;
}

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export const isImageFile = (filename: string): boolean => {
  return /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filename);
};
