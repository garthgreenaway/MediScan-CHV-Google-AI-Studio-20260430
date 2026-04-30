import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  History, 
  Scan, 
  ClipboardCheck, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowLeft,
  Camera,
  LogOut,
  User as UserIcon,
  RefreshCw,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  serverTimestamp, 
  Timestamp 
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { performTriage, performMalnutritionScan } from './services/geminiService';

// --- Types ---
interface Assessment {
  id: string;
  childAge: number;
  childTemp: number;
  duration: number;
  symptoms: string;
  location: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  likelyCondition: string;
  immediateAction: string;
  alertDistrict: boolean;
  createdAt: Timestamp;
}

interface ScanResult {
  id: string;
  muacEstimate: number;
  wastingSigns: boolean;
  confidence: 'Low' | 'Medium' | 'High';
  createdAt: Timestamp;
}

// --- Components ---

const Login = ({ onLogin }: { onLogin: () => void }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center border border-slate-100">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
          <ClipboardCheck className="text-white w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">MediScan</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          CHV Pediatric Triage Assistant for rural health communities.
        </p>
        <button
          onClick={onLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shadow-md hover:shadow-lg active:scale-[0.98]"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/navigation/google_signin_buttons/google_favicon_31.png" alt="Google" className="w-5 h-5 bg-white rounded-full p-0.5" />
          Continue with Google
        </button>
      </div>
    </div>
  );
};

const Dashboard = ({ 
  user, 
  onTriage, 
  onScan, 
  onHistory 
}: { 
  user: User, 
  onTriage: () => void, 
  onScan: () => void, 
  onHistory: () => void 
}) => {
  return (
    <div className="flex flex-col h-full">
      <header className="px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Welcome Back</p>
              <h2 className="font-bold text-slate-900">{user.displayName}</h2>
            </div>
          </div>
          <button onClick={() => signOut(auth)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-xl shadow-blue-200 mb-8 relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-2">Ready to assist?</h3>
            <p className="text-blue-100 text-sm opacity-90 max-w-[200px]">Perform child triage or malnutrition scans in the field.</p>
          </div>
          <ClipboardCheck className="absolute top-1/2 right-[-10px] transform -translate-y-1/2 w-32 h-32 text-blue-500/30 -rotate-12" />
        </div>
      </header>

      <main className="flex-1 px-6 pb-6 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={onTriage}
            className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Plus className="text-emerald-600 w-6 h-6" />
            </div>
            <span className="font-semibold text-slate-800">New Triage</span>
          </button>
          
          <button 
            onClick={onScan}
            className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Scan className="text-amber-600 w-6 h-6" />
            </div>
            <span className="font-semibold text-slate-800">Vision Scan</span>
          </button>

          <button 
            onClick={onHistory}
            className="col-span-2 flex items-center gap-4 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <History className="text-blue-600 w-6 h-6" />
            </div>
            <div className="flex-1 text-left">
              <span className="font-semibold text-slate-800 block">Assessment History</span>
              <span className="text-xs text-slate-400">View past triage records</span>
            </div>
            <ChevronRight className="text-slate-300" />
          </button>
        </div>
      </main>
    </div>
  );
};

const TriageForm = ({ onBack }: { onBack: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [formData, setFormData] = useState({
    age: 3,
    temp: 37.5,
    duration: 1,
    symptoms: '',
    location: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await performTriage(
        formData.age,
        formData.temp,
        formData.duration,
        formData.symptoms,
        formData.location
      );
      setResult(data);
      
      // Save to Firebase
      const path = 'assessments';
      try {
        await addDoc(collection(db, path), {
          ...formData,
          userId: auth.currentUser?.uid,
          riskLevel: data.risk_level,
          likelyCondition: data.likely_condition,
          immediateAction: data.immediate_action,
          alertDistrict: data.alert_district,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to process triage. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const riskColors = {
      'High': 'bg-red-50 text-red-700 border-red-100',
      'Medium': 'bg-amber-50 text-amber-700 border-amber-100',
      'Low': 'bg-emerald-50 text-emerald-700 border-emerald-100'
    }[result.risk_level as 'High'|'Medium'|'Low'] || 'bg-slate-50 text-slate-700 border-slate-100';

    return (
      <div className="flex flex-col h-full p-6">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setResult(null)} className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h2 className="text-xl font-bold text-slate-900">Analysis Result</h2>
        </div>

        <div className={`p-8 rounded-3xl border-2 mb-6 text-center ${riskColors}`}>
          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mx-auto mb-4 shadow-sm">
            {result.risk_level === 'High' ? <AlertTriangle className="w-8 h-8 text-red-600" /> : <CheckCircle2 className="w-8 h-8 text-emerald-600" />}
          </div>
          <p className="text-sm font-bold uppercase tracking-widest mb-1 opacity-70">Risk Level</p>
          <h3 className="text-4xl font-black mb-2">{result.risk_level}</h3>
          <p className="font-medium">{result.likely_condition}</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mb-6">
          <h4 className="font-bold text-slate-900 flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-500" />
            Recommended Action
          </h4>
          <p className="text-slate-600 leading-relaxed italic">"{result.immediate_action}"</p>
          
          {result.alert_district && (
            <div className="mt-4 p-4 bg-red-50 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <p className="text-xs text-red-800 font-medium">District health officials will be notified of this high-risk case.</p>
            </div>
          )}
        </div>

        <button 
          onClick={onBack}
          className="mt-auto w-full py-4 bg-slate-900 text-white font-bold rounded-2xl active:scale-[0.98]"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h2 className="text-xl font-bold text-slate-900">Child Triage</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 flex-1 overflow-y-auto pr-2">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Age (Years)</label>
          <input 
            type="number" 
            required 
            value={formData.age}
            onChange={e => setFormData({...formData, age: Number(e.target.value)})}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" 
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2 flex justify-between">
            Temperature (°C)
            <span className="text-blue-600">{formData.temp}°C</span>
          </label>
          <input 
            type="range" 
            min="35" 
            max="42" 
            step="0.1"
            value={formData.temp}
            onChange={e => setFormData({...formData, temp: Number(e.target.value)})}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1 uppercase font-bold">
            <span>Normal</span>
            <span>Fever</span>
            <span>Hyper</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Duration (Days)</label>
          <input 
            type="number" 
            required 
            value={formData.duration}
            onChange={e => setFormData({...formData, duration: Number(e.target.value)})}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" 
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Symptoms</label>
          <textarea 
            required 
            rows={3}
            placeholder="e.g. Cough, vomiting, shivering..."
            value={formData.symptoms}
            onChange={e => setFormData({...formData, symptoms: e.target.value})}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" 
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Location</label>
          <input 
            type="text" 
            required 
            placeholder="Rural District A"
            value={formData.location}
            onChange={e => setFormData({...formData, location: e.target.value})}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" 
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
        >
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : "Analyze Assessment"}
        </button>
      </form>
    </div>
  );
};

const MalnutritionScanner = ({ onBack }: { onBack: () => void }) => {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleScan = async () => {
    if (!image) return;
    setLoading(true);
    try {
      const data = await performMalnutritionScan(image);
      setResult(data);

      // Save to Firebase
      const path = 'scans';
      try {
        await addDoc(collection(db, path), {
          userId: auth.currentUser?.uid,
          muacEstimate: Number(data.muac_estimate_cm),
          wastingSigns: data.wasting_signs === 'Yes',
          confidence: data.confidence,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    } catch (error) {
      console.error(error);
      alert("Analysis failed. Try a clearer image.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h2 className="text-xl font-bold text-slate-900">Malnutrition Scan</h2>
      </div>

      {!result ? (
        <div className="flex-1 flex flex-col gap-6">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 border-4 border-dashed border-slate-200 rounded-3xl bg-slate-50 flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
          >
            {image ? (
              <img src={image} className="max-h-full rounded-2xl object-contain shadow-lg" alt="Preview" />
            ) : (
              <>
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-100">
                  <Camera className="w-10 h-10 text-slate-400" />
                </div>
                <p className="font-bold text-slate-700 mb-1">Click to Upload Image</p>
                <p className="text-xs text-slate-400">Arm MUAC or child face</p>
              </>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*"
            />
          </div>

          <button 
            onClick={handleScan}
            disabled={!image || loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-amber-100 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Scan className="w-5 h-5" />}
            {loading ? "Analyzing..." : "Start AI Scan"}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center">
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">Scan Metrics</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="p-4 bg-slate-50 rounded-2xl">
                <span className="block text-[10px] text-slate-400 font-bold mb-1 uppercase">MUAC (est)</span>
                <span className="text-2xl font-black text-slate-900">{result.muac_estimate_cm}cm</span>
              </div>
              <div className={`p-4 rounded-2xl ${result.wasting_signs === 'Yes' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <span className="block text-[10px] opacity-60 font-bold mb-1 uppercase">Wasting</span>
                <span className="text-2xl font-black">{result.wasting_signs}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-slate-400 text-sm">Confidence:</span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                result.confidence === 'High' ? 'bg-emerald-100 text-emerald-700' : 
                result.confidence === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
              }`}>
                {result.confidence}
              </span>
            </div>
          </div>

          <button 
            onClick={() => setResult(null)}
            className="mt-auto w-full py-4 bg-slate-900 text-white font-bold rounded-2xl active:scale-[0.98]"
          >
            New Scan
          </button>
        </div>
      )}
    </div>
  );
};

const HistoryView = ({ onBack }: { onBack: () => void }) => {
  const [items, setItems] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!auth.currentUser) return;
      const path = 'assessments';
      try {
        const q = query(
          collection(db, path), 
          where("userId", "==", auth.currentUser.uid),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
        setItems(data);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, path);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 rounded-xl bg-white border border-slate-100 shadow-sm">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h2 className="text-xl font-bold text-slate-900">History</h2>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-40">
          <History className="w-16 h-16 mb-4" />
          <p className="font-medium">No assessments yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {items.map(item => (
            <div key={item.id} className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-bold text-slate-900">{item.likelyCondition || 'Assessment'}</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {item.createdAt?.toDate().toLocaleDateString()} at {item.createdAt?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  item.riskLevel === 'High' ? 'bg-red-50 text-red-600' : 
                  item.riskLevel === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {item.riskLevel}
                </span>
              </div>
              <p className="text-xs text-slate-500 line-clamp-1 mb-2">Age: {item.childAge}yr · {item.childTemp}°C · {item.location}</p>
              <div className="flex items-center gap-2 text-[10px] text-blue-600 font-bold bg-blue-50/50 p-2 rounded-xl border border-blue-50">
                <CheckCircle2 className="w-3 h-3" />
                {item.immediateAction}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'dashboard' | 'triage' | 'scan' | 'history'>('dashboard');
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-12 h-12 bg-blue-600 rounded-2xl"
        />
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans max-w-md mx-auto relative shadow-2xl overflow-hidden flex flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="flex-1 h-full overflow-hidden"
        >
          {view === 'dashboard' && (
            <Dashboard 
              user={user} 
              onTriage={() => setView('triage')} 
              onScan={() => setView('scan')} 
              onHistory={() => setView('history')} 
            />
          )}
          {view === 'triage' && <TriageForm onBack={() => setView('dashboard')} />}
          {view === 'scan' && <MalnutritionScanner onBack={() => setView('dashboard')} />}
          {view === 'history' && <HistoryView onBack={() => setView('dashboard')} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
