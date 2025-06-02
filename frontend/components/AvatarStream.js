import { useEffect, useRef } from 'react';

const AvatarStream = () => {
  const videoRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    // WebSocket connection and media handling logic will go here
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="relative w-full aspect-video bg-gray-900 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        playsInline
      />
    </div>
  );
};

export default AvatarStream; 