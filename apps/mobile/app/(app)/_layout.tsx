import { Slot } from 'expo-router';
import { LedSignBridge } from '../../components/LedSignBridge';

export default function AppLayout() {
  return (
    <>
      <LedSignBridge />
      <Slot />
    </>
  );
}
