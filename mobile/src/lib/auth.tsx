import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { saveToken, SITE_URL, storedToken } from "./session";

type Session = {user:{id:string;email:string};hasAccess:boolean};
type AuthState = {
  session: Session | null;
  loading: boolean;
  hasAccess: boolean;
  signIn: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);
const nativeCallback="pmrfp://auth/callback";
const randomHex=async()=>Array.from(await Crypto.getRandomBytesAsync(32), b=>b.toString(16).padStart(2,"0")).join("");

async function profile(token:string):Promise<Session|null> {
  const result=await fetch(SITE_URL+"/api/mobile/session",{headers:{authorization:"Bearer "+token}});
  if (result.status===401) {
    await saveToken(null);
    return null;
  }
  if (!result.ok) throw Error("PMRFP sign-in is temporarily unavailable.");
  return result.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,setSession]=useState<Session|null>(null);
  const [loading,setLoading]=useState(true);
  async function refreshAccess() {
    const token=await storedToken();
    if (token) setSession(await profile(token));
    else setSession(null);
  }
  useEffect(()=>{
    void refreshAccess().catch(()=>null).finally(()=>setLoading(false));
  },[]);
  const value:AuthState={
    session,loading,hasAccess:session?.hasAccess ?? false,refreshAccess,
    signIn:async()=>{
      try {
        if (Platform.OS==="web") {
          await WebBrowser.openBrowserAsync(SITE_URL+"/sign-in");
          return {error:"Open the PMRFP app on your phone to sign in here."};
        }
        const [verifier,state]=await Promise.all([randomHex(),randomHex()]);
        const challenge=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,verifier);
        const result=await WebBrowser.openAuthSessionAsync(SITE_URL+"/api/mobile/connect?"+new URLSearchParams({challenge,state}),nativeCallback);
        if (result.type!=="success") return {error:"Sign-in was cancelled."};
        const callback=new URL(result.url);
        if (callback.protocol!=="pmrfp:" || callback.hostname!=="auth" || callback.pathname!=="/callback" ||
            callback.searchParams.get("state")!==state) return {error:"Sign-in could not be verified."};
        const code=callback.searchParams.get("code");
        if (!code || !/^[a-f0-9]{64}$/.test(code)) return {error:"Sign-in could not be verified."};
        const exchange=await fetch(SITE_URL+"/api/mobile/session",{method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({code,verifier})});
        if (!exchange.ok) return {error:"Sign-in expired. Please try again."};
        const {token}=await exchange.json() as {token:string};
        await saveToken(token);
        const signed=await profile(token);
        if (!signed) return {error:"Sign-in could not be completed."};
        setSession(signed);
        return {error:null};
      } catch { return {error:"Sign-in is temporarily unavailable. Please try again."}; }
    },
    signOut:async()=>{
      const token=await storedToken();
      await saveToken(null);
      setSession(null);
      if (token) await fetch(SITE_URL+"/api/mobile/session",{method:"DELETE",headers:{authorization:"Bearer "+token}}).catch(()=>null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthState {
  const context=useContext(AuthContext);
  if (!context) throw Error("useAuth must be inside AuthProvider");
  return context;
}
