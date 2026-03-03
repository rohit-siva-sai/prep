declare module "react-speech-recognition" {
  type SpeechRecognitionOptions = {
    continuous?: boolean;
    language?: string;
    interimResults?: boolean;
  };

  type UseSpeechRecognitionResult = {
    transcript: string;
    interimTranscript: string;
    finalTranscript: string;
    listening: boolean;
    resetTranscript: () => void;
    browserSupportsSpeechRecognition: boolean;
    isMicrophoneAvailable?: boolean;
  };

  type SpeechRecognitionApi = {
    startListening: (options?: SpeechRecognitionOptions) => Promise<void> | void;
    stopListening: () => Promise<void> | void;
    abortListening: () => Promise<void> | void;
    browserSupportsSpeechRecognition: () => boolean;
  };

  const SpeechRecognition: SpeechRecognitionApi;
  export const useSpeechRecognition: () => UseSpeechRecognitionResult;
  export default SpeechRecognition;
}
