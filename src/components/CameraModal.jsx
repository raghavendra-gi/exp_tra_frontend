import { useRef, useEffect, useState } from 'react';
import Modal from './Modal';

export default function CameraModal({ isOpen, onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);

  /*
   * The callbacks are read through refs. Before, `onClose` was a new function on
   * every render of the form, and it was an effect dependency — so typing in any
   * field stopped the camera and asked for it again while this dialog was open.
   */
  const onCloseRef = useRef(onClose);
  const onCaptureRef = useRef(onCapture);
  useEffect(() => { onCloseRef.current = onClose; onCaptureRef.current = onCapture; });

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setReady(false);

    const stop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      alert('This device or browser has no camera access. Please use the upload button.');
      onCloseRef.current?.();
      return undefined;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } }) // 'environment' prefers rear camera on mobile
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Camera access denied or unavailable:', err);
        alert('Could not access the camera. Please check your permissions or use the upload button.');
        onCloseRef.current?.();
      });

    return () => { cancelled = true; stop(); };
  }, [isOpen]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Draw the current video frame to a hidden canvas
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        onCaptureRef.current?.(file);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Take Photo" size="sm">
      <div style={{ textAlign: 'center' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedData={() => setReady(true)}
          style={{ width: '100%', borderRadius: 'var(--r-sm)', background: '#000', maxHeight: '60vh', objectFit: 'cover', aspectRatio: '4 / 3' }}
        />
        <div className="btn-row" style={{ marginTop: 'var(--sp-4)', justifyContent: 'center' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`btn btn-primary ${ready ? '' : 'is-busy'}`} onClick={handleCapture} disabled={!ready}>
            Capture Photo
          </button>
        </div>
      </div>
    </Modal>
  );
}
