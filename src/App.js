import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    signInAnonymously,
    signInWithCustomToken
} from 'firebase/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { 
    getFirestore,
    collection,
    doc,
    getDoc,
    setDoc,
    addDoc,
    query,
    where,
    onSnapshot,
    getDocs
} from 'firebase/firestore';

// Firebase Configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Gemini API Key from environment variables
const geminiApiKey = process.env.REACT_APP_GEMINI_API_KEY;

// Backend URL from environment variables
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

// Create a context for the Gemini AI client
const GeminiAIContext = React.createContext(null);

// Initialize Firebase
let app;
let analytics;
let auth;
let db;

// Initialize Firebase services
try {
    app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase:', error);
}

// --- Main App Component ---
// Gemini AI Provider Component
function GeminiAIProvider({ children }) {
    const [genAI, setGenAI] = useState(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const initializeGemini = async () => {
            if (!geminiApiKey) {
                setError('Gemini API key is missing. Please set REACT_APP_GEMINI_API_KEY in your .env file');
                return;
            }

            try {
                const client = new GoogleGenerativeAI(geminiApiKey);
                // Test the client with a simple model
                await client.getGenerativeModel({ model: "gemini-pro" });
                setGenAI(client);
                setIsInitialized(true);
                console.log('Gemini AI initialized successfully');
            } catch (err) {
                console.error('Error initializing Gemini AI:', err);
                setError(`Failed to initialize Gemini AI: ${err.message}`);
            }
        };

        initializeGemini();
    }, []);

    return (
        <GeminiAIContext.Provider value={{ genAI, isInitialized, error }}>
            {children}
        </GeminiAIContext.Provider>
    );
}

// Custom hook to use Gemini AI
const useGeminiAI = () => {
    const context = React.useContext(GeminiAIContext);
    if (context === undefined) {
        throw new Error('useGeminiAI must be used within a GeminiAIProvider');
    }
    return context;
};

export default function App() {
    console.log('App component rendering...');
    // --- State Management ---
    const [page, setPage] = useState('home'); // Controls navigation
    const [user, setUser] = useState(null); // Current authenticated user
    const [userData, setUserData] = useState(null); // User data from Firestore
    const [isAuthReady, setIsAuthReady] = useState(false); // Tracks if auth state has been checked
    
    console.log('Current page:', page);
    console.log('Auth state:', { user, isAuthReady });

    // --- Firebase Initialization and Auth State ---
    useEffect(() => {
        let unsubscribe;
        
        const initializeFirebase = async () => {
            try {
                console.log('Initializing Firebase...');
                const app = initializeApp(firebaseConfig);
                console.log('Firebase app initialized');
                
                // Initialize Analytics
                const analytics = getAnalytics(app);
                console.log('Analytics initialized:', analytics);
                
                // Initialize Auth with settings
                const authInstance = getAuth(app);
                authInstance.languageCode = 'en'; // Set default language
                console.log('Auth initialized');
                
                // Initialize Firestore
                const dbInstance = getFirestore(app);
                console.log('Firestore initialized');
                
                // Set auth and db instances in state
                setAuth(authInstance);
                setDb(dbInstance);
                
                console.log('Setting up auth state listener...');
                const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
                    if (currentUser && !currentUser.isAnonymous) {
                        setUser(currentUser);
                        const userDocRef = doc(dbInstance, `/artifacts/${firebaseConfig.appId}/users`, currentUser.uid);
                        const userDocSnap = await getDoc(userDocRef);
                        if (userDocSnap.exists()) {
                            setUserData(userDocSnap.data());
                        } else {
                            const newUserProfile = { email: currentUser.email, role: 'buyer', createdAt: new Date() };
                            await setDoc(userDocRef, newUserProfile);
                            setUserData(newUserProfile);
                        }
                    } else {
                        setUser(null);
                        setUserData(null);
                    }
                    setIsAuthReady(true);
                });
                
                // Cleanup function
                return () => {
                    console.log('Cleaning up auth listener...');
                    unsubscribe();
                };
            } catch (error) {
                console.error('Error initializing Firebase:', error);
                // Provide more specific error messages
                if (error.code === 'auth/invalid-api-key') {
                    console.error('Invalid Firebase API key. Please check your firebaseConfig.');
                } else if (error.code === 'auth/operation-not-allowed') {
                    console.error('Email/Password authentication is not enabled in Firebase Console.');
                } else if (error.code === 'auth/network-request-failed') {
                    console.error('Network error. Please check your internet connection.');
                }
                setIsAuthReady(true); // Ensure UI renders even if Firebase fails
            }
        };

        initializeFirebase();

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, []);

    // --- Navigation Renderer ---
    const renderPage = () => {
        console.log('Rendering page:', page);
        if (!isAuthReady) {
            console.log('Auth not ready, showing loader');
            return <div className="flex items-center justify-center h-screen">
                <div className="loader "></div>
            </div>;
        }
        
        switch (page) {
            case 'shop':
                return <ShopPage db={db} setPage={setPage} />;
            case 'analyze':
                return <PlantAnalyzerPage />;
            case 'sell':
                return <BecomeSellerPage db={db} user={user} userData={userData} setPage={setPage}/>;
            case 'profile':
                 return <ProfilePage user={user} userData={userData} auth={auth} setPage={setPage} />;
            case 'login':
                return <LoginPage auth={auth} setPage={setPage} />;
            case 'dashboard':
                 return <SellerDashboardPage db={db} user={user} />;
            default:
                return <HomePage setPage={setPage} />;
        }
    };

    return (
        <GeminiAIProvider>
            <div className="min-h-screen font-sans bg-gray-100">
                <Navbar setPage={setPage} user={user} userData={userData} />
                <main className="p-4 md:p-8">
                    {renderPage()}
                </main>
                <Footer />
            </div>
        </GeminiAIProvider>
    );
}

// --- UI Components ---

function Navbar({ setPage, user, userData }) {
    return (
        <nav className="sticky top-0 z-50 bg-white shadow-md">
            <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <span onClick={() => setPage('home')} className="flex items-center cursor-pointer">
                                <svg className="w-8 h-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9.75v1.5a2.25 2.25 0 0 1-2.25 2.25h-5.379a1.5 1.5 0 0 1-1.06-.44L11.25 11.25l-2.625 2.625a1.5 1.5 0 0 0-1.06 2.56l5.379 5.379a2.25 2.25 0 0 1 0 3.182l-1.5 1.5a2.25 2.25 0 0 1-3.182 0l-5.379-5.379a1.5 1.5 0 0 1-.44-1.06v-5.379a2.25 2.25 0 0 1 2.25-2.25H9.75" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9" />
                                </svg>
                                <span className="ml-2 text-xl font-bold text-gray-800">AgroScan</span>
                            </span>
                        </div>
                        <div className="hidden md:block">
                            <div className="flex items-baseline ml-10 space-x-4">
                                <button onClick={() => setPage('home')} className="px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-green-600 hover:text-white">Home</button>
                                <button onClick={() => setPage('shop')} className="px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-green-600 hover:text-white">Shop</button>
                                <button onClick={() => setPage('analyze')} className="px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-green-600 hover:text-white">AI Analyzer</button>
                                {userData?.role === 'seller' && (
                                     <button onClick={() => setPage('dashboard')} className="px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-green-600 hover:text-white">Seller Dashboard</button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="hidden md:block">
                        {user ? (
                            <button onClick={() => setPage('profile')} className="px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-green-600 hover:text-white">Profile</button>
                        ) : (
                            <button onClick={() => setPage('login')} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700">Login / Sign Up</button>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}

function HomePage({ setPage }) {
    return (
        <div className="relative overflow-hidden bg-white">
            <div className="mx-auto max-w-7xl">
                <div className="relative pb-8 bg-white z-1 sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
                    <main className="px-4 mx-auto mt-10 max-w-7xl sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
                        <div className="sm:text-center lg:text-left">
                            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
                                <span className="block xl:inline">Smarter Plant Care,</span>{' '}
                                <span className="block text-green-600 xl:inline">Healthier Harvest</span>
                            </h1>
                            <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                                Use our AI to instantly detect plant diseases. Buy and sell agricultural products in our trusted marketplace. Join the future of farming.
                            </p>
                            <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
                                <div className="rounded-md shadow">
                                    <button onClick={() => setPage('analyze')} className="flex items-center justify-center w-full px-8 py-3 text-base font-medium text-white bg-green-600 border border-transparent rounded-md cursor-pointer hover:bg-green-700 md:py-4 md:text-lg md:px-10">
                                        Analyze a Plant
                                    </button>
                                </div>
                                <div className="mt-3 sm:mt-0 sm:ml-3">
                                    <button onClick={() => setPage('shop')} className="flex items-center justify-center w-full px-8 py-3 text-base font-medium text-green-700 bg-green-100 border border-transparent rounded-md cursor-pointer hover:bg-green-200 md:py-4 md:text-lg md:px-10">
                                        Go to Shop
                                    </button>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
            <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
                <img className="object-cover w-full h-56 sm:h-72 md:h-96 lg:w-full lg:h-full" src="https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?q=80&w=2070&auto=format&fit=crop" alt="Healthy plants"/>
            </div>
        </div>
    );
}

function ShopPage({ db }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        
        const productsCollection = collection(db, `artifacts/${firebaseConfig.appId}/public/data/products`);
        const q = query(productsCollection, where("isApproved", "==", true));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const productsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProducts(productsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching products: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db]);
    
    if (loading) return <div className="flex items-center justify-center h-64"><div className="loader"></div></div>;

    return (
        <div className="mx-auto max-w-7xl">
            <h1 className="mb-6 text-3xl font-bold text-gray-900">Marketplace</h1>
            {products.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-lg shadow">
                    <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No products available</h3>
                    <p className="mt-1 text-sm text-gray-500">Check back later for new items!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {products.map(product => <ProductCard key={product.id} product={product} />)}
                </div>
            )}
        </div>
    );
}

function ProductCard({ product }) {
    return (
        <div className="overflow-hidden transition-transform transform bg-white rounded-lg shadow-lg hover:-translate-y-1">
            <img className="object-cover w-full h-48" src={product.imageUrl || 'https://placehold.co/600x400/a8e063/FFFFFF?text=Product'} alt={product.name} />
            <div className="flex flex-col flex-grow p-4">
                <h3 className="flex-grow text-lg font-semibold text-gray-800">{product.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{product.category}</p>
                <div className="flex items-center justify-between mt-4">
                    <p className="text-xl font-bold text-green-600">${product.price}</p>
                    <button className="px-3 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full hover:bg-green-200">View</button>
                </div>
            </div>
        </div>
    );
}

function LoginPage({ auth, setPage }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (!auth) {
                throw new Error('Authentication service not ready. Please try again.');
            }
            
            if (isSignUp) {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            setPage('home');
        } catch (err) {
            console.error('Auth Error:', err);
            setError(err.message || 'An error occurred during authentication. Please try again.');
        }
    };

    return (
        <div className="max-w-md p-8 mx-auto mt-10 bg-white shadow-lg rounded-xl">
            <h2 className="mb-6 text-2xl font-bold text-center">{isSignUp ? 'Create an Account' : 'Welcome Back!'}</h2>
            {error && <p className="p-3 mb-4 text-red-700 bg-red-100 rounded-md">{error}</p>}
            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label className="block text-gray-700">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" required />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-700">Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" required />
                </div>
                <button type="submit" className="w-full py-2 text-white transition-colors bg-green-600 rounded-md hover:bg-green-700">
                    {isSignUp ? 'Sign Up' : 'Login'}
                </button>
            </form>
            <p className="mt-4 text-sm text-center">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                <button onClick={() => setIsSignUp(!isSignUp)} className="ml-1 font-semibold text-green-600 hover:underline">
                    {isSignUp ? 'Login' : 'Sign Up'}
                </button>
            </p>
        </div>
    );
}

function ProfilePage({ user, userData, auth, setPage }) {
    const handleLogout = async () => {
        await signOut(auth);
        setPage('home');
    };

    if (!user) {
        return (
            <div className="max-w-lg p-8 mx-auto text-center bg-white shadow-lg rounded-xl">
                 <h2 className="mb-4 text-2xl font-bold">You are not logged in</h2>
                 <p className="mb-6 text-gray-600">Please log in to view your profile.</p>
                 <button onClick={() => setPage('login')} className="px-6 py-2 text-white bg-green-600 rounded-md hover:bg-green-700">Go to Login</button>
            </div>
        );
    }

    return (
        <div className="max-w-lg p-8 mx-auto bg-white shadow-lg rounded-xl">
            <h2 className="mb-4 text-2xl font-bold">My Profile</h2>
            <p className="mb-2"><strong>Email:</strong> {user.email}</p>
            <p className="mb-4"><strong>User Role:</strong> <span className="px-2 py-1 text-sm font-semibold text-blue-800 capitalize bg-blue-200 rounded-full">{userData?.role}</span></p>
             {userData?.role === 'buyer' && (
                <button onClick={() => setPage('sell')} className="w-full py-2 mb-4 text-white transition-colors bg-yellow-500 rounded-md hover:bg-yellow-600">
                    Become a Seller
                </button>
            )}
            <button onClick={handleLogout} className="w-full py-2 text-white transition-colors bg-red-600 rounded-md hover:bg-red-700">
                Logout
            </button>
        </div>
    );
}

function BecomeSellerPage({ db, user, userData, setPage }) {
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState(''); // 'success' or 'error'

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user || !db) {
            setStatus('error');
            setMessage('You must be logged in to send a request.');
            return;
        }

        try {
            const sellerRequestRef = collection(db, `/artifacts/${firebaseConfig.appId}/public/data/sellerRequests`);
            const q = query(sellerRequestRef, where("uid", "==", user.uid));
            const existingRequests = await getDocs(q);

            if (!existingRequests.empty) {
                setStatus('error');
                setMessage('You have already submitted a seller request.');
                return;
            }

            await addDoc(sellerRequestRef, {
                uid: user.uid,
                email: user.email,
                status: 'pending',
                requestedAt: new Date()
            });
            setStatus('success');
            setMessage('Your request to become a seller has been submitted! An admin will review it shortly.');
        } catch (error) {
            console.error("Error submitting seller request:", error);
            setStatus('error');
            setMessage('An error occurred. Please try again.');
        }
    };
    
    if (!user) {
        return (
             <div className="max-w-lg p-8 mx-auto text-center bg-white shadow-lg rounded-xl">
                 <h2 className="mb-4 text-2xl font-bold">Authentication Required</h2>
                 <p className="mb-6 text-gray-600">Please log in to apply to be a seller.</p>
                 <button onClick={() => setPage('login')} className="px-6 py-2 text-white bg-green-600 rounded-md hover:bg-green-700">Go to Login</button>
            </div>
        )
    }

     if (userData?.role === 'seller') {
        return (
            <div className="max-w-lg p-8 mx-auto text-center bg-white shadow-lg rounded-xl">
                <h2 className="mb-4 text-2xl font-bold text-green-700">You are already a Seller!</h2>
                <p className="text-gray-600">You can start listing your products from your seller dashboard.</p>
                <button onClick={() => setPage('dashboard')} className="px-6 py-2 mt-4 text-white bg-green-600 rounded-md hover:bg-green-700">Go to Dashboard</button>
            </div>
        )
    }

    return (
        <div className="max-w-lg p-8 mx-auto bg-white shadow-lg rounded-xl">
            <h2 className="mb-4 text-2xl font-bold">Become a Seller</h2>
            <p className="mb-6 text-gray-600">Join our marketplace to sell your products to a wide audience. Submit your request, and our admin team will review your profile for verification.</p>
            {message && (
                <div className={`p-3 rounded-md mb-4 ${status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                    {message}
                </div>
            )}
            <form onSubmit={handleSubmit}>
                <button type="submit" className="w-full py-2 text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400" disabled={!!message}>
                    Submit Seller Request
                </button>
            </form>
        </div>
    );
}

function SellerDashboardPage({ db, user }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [productName, setProductName] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [diseasePrediction, setDiseasePrediction] = useState('');
    const [feedback, setFeedback] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const fetchProducts = useCallback(() => {
        if (!db || !user) return;
        setLoading(true);
        const productsCollection = collection(db, `/artifacts/${firebaseConfig.appId}/public/data/products`);
        const q = query(productsCollection, where("sellerId", "==", user.uid));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const productsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProducts(productsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching seller products: ", error);
            setLoading(false);
        });

        return unsubscribe;
    }, [db, user]);

    useEffect(() => {
        const unsubscribe = fetchProducts();
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [fetchProducts]);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setDiseasePrediction('');
        setFeedback('Analyzing image...');
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('http://127.0.0.1:8000/predict', {
                method: 'POST',
                body: formData,
            });
            
            if (!response.ok) {
                throw new Error('Failed to analyze image');
            }
            
            const result = await response.json();
            setDiseasePrediction(result.prediction);
            setFeedback('Analysis complete!');
            
        } catch (error) {
            console.error('Error analyzing image:', error);
            setFeedback('Failed to analyze image. Please try again.');
            setDiseasePrediction('');
        }
    };

    const analyzeImage = async () => {
        if (!selectedFile) return;
        
        setIsAnalyzing(true);
        setFeedback('Analyzing image...');
        
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            
            const response = await fetch('http://127.0.0.1:8000/predict', {
                method: 'POST',
                body: formData,
            });
            
            if (!response.ok) {
                throw new Error('Failed to analyze image');
            }
            
            const result = await response.json();
            setDiseasePrediction(result.prediction);
            setFeedback('Analysis complete!');
        } catch (error) {
            console.error('Error analyzing image:', error);
            setFeedback('Failed to analyze image. Please try again.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleAddProduct = async (e) => {
        e.preventDefault();
        setFeedback('');
        
        if (!productName || !price || !category || !selectedFile) {
            setFeedback('Please fill out all required fields and select an image.');
            return;
        }
        
        // If there's a disease prediction, include it in the product details
        const productData = {
            name: productName,
            price: Number(price),
            category,
            imageUrl: previewUrl, // Using the preview URL for now
            diseasePrediction: diseasePrediction || 'No disease detected',
            sellerId: user.uid,
            isApproved: false,
            createdAt: new Date(),
        };
        
        try {
            // In a real app, you would upload the image to a storage service here
            // and get a permanent URL before saving to the database
            
            await addDoc(collection(db, `/artifacts/${firebaseConfig.appId}/public/data/products`), productData);
            
            setFeedback('Product added successfully! It will appear in the shop after admin approval.');
            
            // Clear form
            setProductName('');
            setPrice('');
            setCategory('');
            setSelectedFile(null);
            setPreviewUrl('');
            setDiseasePrediction('');
            document.getElementById('image-upload').value = ''; // Reset file input
            
        } catch (error) {
            console.error("Error adding product: ", error);
            setFeedback('Failed to add product.');
        }
    };

    if (!user) return <p>Please log in to view your dashboard.</p>;
    
    return (
        <div className="grid grid-cols-1 gap-8 mx-auto max-w-7xl lg:grid-cols-3">
            <div className="p-6 bg-white shadow-lg lg:col-span-1 rounded-xl">
                <h2 className="mb-4 text-2xl font-bold">Add New Product</h2>
                <form onSubmit={handleAddProduct} className="space-y-4">
                    <input 
                    type="text" 
                    value={productName} 
                    onChange={(e) => setProductName(e.target.value)} 
                    placeholder="Product Name" 
                    className="w-full p-2 border rounded" 
                    required 
                />
                <input 
                    type="number" 
                    value={price} 
                    onChange={(e) => setPrice(e.target.value)} 
                    placeholder="Price (₹)" 
                    className="w-full p-2 border rounded" 
                    required 
                />
                <input 
                    type="text" 
                    value={category} 
                    onChange={(e) => setCategory(e.target.value)} 
                    placeholder="Category" 
                    className="w-full p-2 border rounded" 
                    required 
                />
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Product Image</label>
                    <input 
                        id="image-upload"
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileChange} 
                        className="w-full p-2 border rounded" 
                        required 
                    />
                    {previewUrl && (
                        <div className="mt-2">
                            <img 
                                src={previewUrl} 
                                alt="Preview" 
                                className="h-32 w-32 object-cover rounded" 
                            />
                            <button
                                type="button"
                                onClick={analyzeImage}
                                disabled={isAnalyzing}
                                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
                            >
                                {isAnalyzing ? 'Analyzing...' : 'Analyze for Diseases'}
                            </button>
                            {diseasePrediction && (
                                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                                    <p className="text-sm text-yellow-800">
                                        <span className="font-semibold">Disease Detected:</span> {diseasePrediction}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                    <button type="submit" className="w-full py-2 text-white bg-green-600 rounded-md hover:bg-green-700">Add Product</button>
                    {feedback && <p className="mt-2 text-sm text-center">{feedback}</p>}
                </form>
            </div>
            <div className="p-6 bg-white shadow-lg lg:col-span-2 rounded-xl">
                <h2 className="mb-4 text-2xl font-bold">Your Products</h2>
                {loading ? <p>Loading products...</p> : (
                    <div className="space-y-4">
                        {products.length === 0 ? <p>You haven't added any products yet.</p> : products.map(p => (
                            <div key={p.id} className="flex items-center justify-between p-3 border rounded-md">
                                <div>
                                    <p className="font-semibold">{p.name}</p>
                                    <p className="text-sm text-gray-500">${p.price}</p>
                                </div>
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${p.isApproved ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                                    {p.isApproved ? 'Approved' : 'Pending'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function PlantAnalyzerPage() {
    // This component combines the logic from the previous HTML file
    const [imagePreviewUrl, setImagePreviewUrl] = useState('');
    const [base64ImageData, setBase64ImageData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState('');
    
    // Get the Gemini AI client from context
    const { genAI, isInitialized, error: geminiError } = useGeminiAI();

    const handleImageChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setImagePreviewUrl(e.target.result);
                setBase64ImageData(e.target.result.split(',')[1]);
                setResults(null);
                setError('');
            }
            reader.readAsDataURL(file);
        }
    };
    
    const analyzeWithCustomModel = async () => {
        setError("Custom model integration is a placeholder. This button demonstrates where you would connect your own deployed model's API. The app is currently using the Gemini API for a live demonstration.");
    };


    const analyzeWithGemini = async () => {
        if (!base64ImageData) {
            setError("Please upload an image first.");
            return;
        }

        if (!isInitialized) {
            setError(geminiError || 'Gemini AI is still initializing. Please try again in a moment.');
            return;
        }

        setIsLoading(true);
        setError('');
        setResults(null);

        try {

            // Get the generative model - using the latest gemini-1.5-flash model
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            // Prepare the prompt
            const prompt = `Analyze this plant leaf image and provide the following information in a valid JSON format:
            {
                "plant_identification": {
                    "plant_name": "...",
                    "confidence": "..."
                },
                "health_status": {
                    "is_healthy": true/false,
                    "disease_detected": "...",
                    "disease_description": "...",
                    "confidence": "..."
                },
                "care_recommendations": {
                    "suggested_cure": "...",
                    "recommended_products": [
                        {
                            "product_name": "...",
                            "product_type": "..."
                        }
                    ]
                }
            }`;

            // Clean the base64 data if it has a data URL prefix
            const imageData = base64ImageData.includes('base64,') 
                ? base64ImageData.split(',')[1] 
                : base64ImageData;
            
            try {
                // Generate content
                const result = await model.generateContent([
                    { text: prompt },
                    { 
                        inlineData: { 
                            data: imageData, 
                            mimeType: 'image/jpeg' 
                        } 
                    }
                ]);
                
                // Get the response text
                const response = await result.response;
                const text = await response.text();
                
                // Try to parse the response as JSON
                try {
                    // Clean up the response text to ensure valid JSON
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        throw new Error('No JSON response found in the AI response');
                    }
                    const data = JSON.parse(jsonMatch[0]);
                    setResults(data);
                } catch (e) {
                    console.error('Failed to parse response as JSON:', text);
                    throw new Error('The response from the AI could not be parsed. Please try again.');
                }
            } catch (err) {
                console.error('Error generating content:', err);
                throw err;
            }
        } catch (err) {
            setError(`Analysis failed: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
         <div className="grid max-w-4xl grid-cols-1 gap-8 mx-auto md:grid-cols-2">
            {/* Left side: Upload and Preview */}
            <div className="p-6 bg-white shadow-lg rounded-xl">
                <h2 className="mb-4 text-2xl font-bold">Upload Plant Image</h2>
                <input type="file" id="image-upload-react" className="hidden" accept="image/*" onChange={handleImageChange} />
                <label htmlFor="image-upload-react" className="flex flex-col items-center justify-center h-64 p-8 transition-colors border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:border-green-500">
                    {imagePreviewUrl ? (
                         <img src={imagePreviewUrl} alt="Plant preview" className="max-h-full rounded-lg" />
                    ) : (
                        <>
                           <svg className="w-12 h-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                            <span className="mt-2 text-sm font-medium text-gray-700">Click to upload</span>
                        </>
                    )}
                </label>
                {imagePreviewUrl && (
                    <div className="flex flex-col mt-4 space-y-2">
                        <button onClick={analyzeWithGemini} className="w-full py-2 text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50" disabled={isLoading}>
                            {isLoading ? 'Analyzing...' : 'Analyze'}
                        </button>
                    </div>
                )}
            </div>
            {/* Right side: Results */}
            <div className="p-6 bg-white shadow-lg rounded-xl">
                 <h2 className="mb-4 text-2xl font-bold">Analysis Results</h2>
                {isLoading && <div className="flex items-center justify-center h-full"><div className="loader"></div></div>}
                {error && <div className="px-4 py-3 text-red-700 bg-red-100 border border-red-400 rounded-lg">{error}</div>}
                {results ? (
                    <div className="space-y-4">
                        <div className="p-3 border rounded-lg bg-gray-50">
                            <h3 className="font-semibold">Plant ID: <span className="font-bold text-green-700">{results.plant_identification.plant_name}</span></h3>
                        </div>
                        <div className="p-3 border rounded-lg bg-gray-50">
                            <h3 className="font-semibold">Health: {results.health_status.is_healthy ? <span className="text-green-600">Healthy</span> : <span className="text-red-600">Disease Detected</span>}</h3>
                            <p className="font-bold">{results.health_status.disease_detected}</p>
                            <p className="text-sm text-gray-600">{results.health_status.disease_description}</p>
                        </div>
                        <div className="p-3 border rounded-lg bg-gray-50">
                            <h3 className="font-semibold">Cure</h3>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{results.care_recommendations.suggested_cure}</p>
                        </div>
                         <div className="p-3 border rounded-lg bg-gray-50">
                            <h3 className="font-semibold">Products</h3>
                             <ul className="text-sm text-gray-600 list-disc list-inside">
                                {results.care_recommendations.recommended_products.map((p,i) => <li key={i}>{p.product_name}</li>)}
                            </ul>
                        </div>
                    </div>
                ) : (
                    !isLoading && !error && <p className="text-gray-500">Upload an image and click analyze to see results here.</p>
                )}
            </div>
        </div>
    );
}


function Footer() {
    return (
        <footer className="mt-12 bg-white">
            <div className="px-4 py-6 mx-auto text-sm text-center text-gray-500 max-w-7xl sm:px-6 lg:px-8">
                <p>&copy; 2025 AgroScan. All rights reserved.</p>
                <p>A modern solution for a healthier planet.</p>
            </div>
        </footer>
    );
}
