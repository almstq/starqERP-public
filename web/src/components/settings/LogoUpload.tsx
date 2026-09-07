import React, { useState, useRef } from 'react';
import { Upload, Trash2, RefreshCw, AlertCircle, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { Button, Surface, Badge } from '../ui';

export interface LogoUploadProps {
  currentLogoUrl?: string | null;
  entityName: string;
  onSaveLogo: (logoUrl: string | null) => void;
  title?: string;
  description?: string;
  defaultLogoUrl?: string;
}

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml'];

/**
 * Safely validates and sanitizes an uploaded image file
 */
async function validateImageFile(file: File): Promise<{ valid: boolean; error?: string; dataUrl?: string }> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type "${file.type || 'unknown'}". Allowed formats: PNG, WebP, JPEG, SVG.`,
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed size is 2.0 MB.`,
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;

      // Safe SVG handling: inspect text for malicious scripts
      if (file.type === 'image/svg+xml') {
        const lower = result.toLowerCase();
        if (
          lower.includes('<script') ||
          lower.includes('javascript:') ||
          lower.includes('onload=') ||
          lower.includes('onerror=') ||
          lower.includes('onclick=')
        ) {
          resolve({
            valid: false,
            error: 'Security Warning: SVG contains embedded scripts or unsafe event handlers.',
          });
          return;
        }
      }

      resolve({ valid: true, dataUrl: result });
    };

    reader.onerror = () => {
      resolve({ valid: false, error: 'Failed to read image file.' });
    };

    reader.readAsDataURL(file);
  });
}

function getInitials(name: string): string {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const LogoUpload: React.FC<LogoUploadProps> = ({
  currentLogoUrl,
  entityName,
  onSaveLogo,
  title = 'Organisation / Business Logo',
  description = 'Upload an official brand logo for invoices, quotations, top chrome, and client headers. Supports PNG, WebP, JPEG, and SVG up to 2MB.',
  defaultLogoUrl,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = async (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const validation = await validateImageFile(file);
    if (!validation.valid || !validation.dataUrl) {
      setErrorMessage(validation.error || 'Failed to process logo.');
      return;
    }

    onSaveLogo(validation.dataUrl);
    setSuccessMessage('Logo updated successfully and saved to tenant storage.');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // reset input so same file can be selected again
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleRemove = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    onSaveLogo(null);
    setSuccessMessage('Logo removed. System reverted to fallback monogram avatar.');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleResetDefault = () => {
    if (defaultLogoUrl) {
      setErrorMessage(null);
      setSuccessMessage(null);
      onSaveLogo(defaultLogoUrl);
      setSuccessMessage('Logo reset to default template asset.');
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  const initials = getInitials(entityName);

  return (
    <Surface variant="filled" level={1} padding="md" className="space-y-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] pb-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
            <ImageIcon size={16} className="text-[var(--md-sys-color-primary)]" />
            <span>{title}</span>
          </h3>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            {description}
          </p>
        </div>

        {currentLogoUrl ? (
          <Badge variant="accent" size="sm">Active Logo Configured</Badge>
        ) : (
          <Badge variant="neutral" size="sm">Using Initials Fallback</Badge>
        )}
      </div>

      {errorMessage && (
        <div
          className="p-3 rounded-[var(--md-sys-shape-corner-small)] text-xs flex items-center gap-2"
          style={{
            backgroundColor: 'var(--md-sys-color-error-container)',
            color: 'var(--md-sys-color-on-error-container)',
          }}
        >
          <AlertCircle size={15} className="shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          className="p-3 rounded-[var(--md-sys-shape-corner-small)] text-xs flex items-center gap-2"
          style={{
            backgroundColor: 'var(--md-sys-color-primary-container)',
            color: 'var(--md-sys-color-on-primary-container)',
          }}
        >
          <CheckCircle2 size={15} className="shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Main Container: Preview + Controls */}
      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Aspect-Ratio Preserving Preview Frame */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
            Display Preview
          </span>
          <div
            className="w-32 h-32 sm:w-36 sm:h-36 rounded-[var(--md-sys-shape-corner-medium)] flex items-center justify-center p-3 border border-[var(--md-sys-color-outline-variant)] relative overflow-hidden transition-all"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
            }}
          >
            {currentLogoUrl ? (
              <img
                src={currentLogoUrl}
                alt={`${entityName} logo`}
                className="max-w-full max-h-full object-contain select-none"
                onError={() => {
                  setErrorMessage('Failed to render current image. Check URL or file format.');
                }}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-[var(--md-sys-shape-corner-full)] flex items-center justify-center font-bold text-lg tracking-wider select-none"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary-container)',
                  color: 'var(--md-sys-color-on-primary-container)',
                }}
              >
                {initials}
              </div>
            )}
          </div>
          <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] text-center">
            {currentLogoUrl ? 'Preserved aspect ratio (contain)' : `Initials fallback: "${initials}"`}
          </span>
        </div>

        {/* Drop Zone & Actions */}
        <div className="flex-1 w-full space-y-3 min-w-0">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 rounded-[var(--md-sys-shape-corner-medium)] border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/20'
                : 'border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container-high)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.webp,.jpg,.jpeg,.svg,image/png,image/webp,image/jpeg,image/svg+xml"
              onChange={handleInputChange}
              className="hidden"
            />
            <div
              className="w-10 h-10 rounded-[var(--md-sys-shape-corner-full)] flex items-center justify-center"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-highest)',
                color: 'var(--md-sys-color-primary)',
              }}
            >
              <Upload size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                Click to browse or drag and drop image
              </p>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                PNG, WebP, SVG or JPG (max 2.0 MB)
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="tonal"
              size="xs"
              onClick={() => fileInputRef.current?.click()}
              icon={<RefreshCw size={13} />}
            >
              <span>{currentLogoUrl ? 'Replace Logo' : 'Upload Logo'}</span>
            </Button>

            {defaultLogoUrl && defaultLogoUrl !== currentLogoUrl && (
              <Button
                variant="outlined"
                size="xs"
                onClick={handleResetDefault}
              >
                <span>Reset to Default</span>
              </Button>
            )}

            {currentLogoUrl && (
              <Button
                variant="outlined"
                size="xs"
                onClick={handleRemove}
                className="text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]"
                icon={<Trash2 size={13} />}
              >
                <span>Remove Logo</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
};
