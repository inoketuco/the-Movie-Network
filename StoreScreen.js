import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebaseConfig';
import MerchArt, { posterUrl, profileUrl } from './MerchArt';
import { glass, glassShadow, GUTTER, radius, space, type } from './theme';
import { Badge, Banner, Button, ScreenHeader, SectionHeading, Sheet, SummaryRow } from './ui';
import { createReceiptPdf, isPickerCancelled, saveReceiptToDevice, shareReceiptPdf } from './receiptService';
import CheckoutPanel from './CheckoutPanel';
import { withTimeout } from './withTimeout';

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const ORDER_SAVE_TIMEOUT_MS = 15000;
// The payment server (functions/catalog.js) rejects more than 10 of a line or 20 lines.
const MAX_QUANTITY_PER_ITEM = 10;
const MAX_CART_LINES = 20;
const CAST_LIMIT = 12;
// The floating cart pill.
const FAB_WIDTH = 112;
const FAB_HEIGHT = 52;
const FAB_MARGIN = 16;

// Ids and prices must match functions/catalog.js; the chosen movie/character
// is a design choice on top of the product and does not change the price.
const PRODUCTS = [
  { id: 'classic-logo-tee', name: 'Character T-Shirt', category: 'Apparel', price: 24.99, kind: 'tee-character' },
  { id: 'directors-cut-tee', name: 'Movie Poster Tee', category: 'Apparel', price: 29.99, kind: 'tee-poster' },
  { id: 'cinema-legends-poster', name: 'Movie Poster', category: 'Posters', price: 14.99, kind: 'poster' },
  { id: 'midnight-poster', name: 'Premiere Scene Print', category: 'Posters', price: 18.99, kind: 'backdrop-poster' },
  { id: 'popcorn-pin', name: 'Character Enamel Pin', category: 'Accessories', price: 8.99, kind: 'pin' },
  { id: 'movie-fan-mug', name: 'Movie Scene Mug', category: 'Drinkware', price: 12.99, kind: 'mug' },
];

const money = (amount) => `$${amount.toFixed(2)}`;
const needsCharacter = (product) => product.kind === 'tee-character' || product.kind === 'pin';
const lineKeyFor = (productId, design) => [productId, design?.movieId ?? '-', design?.characterId ?? '-'].join(':');
const movieDesign = (movie) => ({
  movieId: movie.id,
  movieTitle: movie.title,
  posterPath: movie.poster_path,
  backdropPath: movie.backdrop_path,
});
const characterDesign = (movie, member) => ({
  ...movieDesign(movie),
  characterId: member.id,
  characterName: member.character,
  actorName: member.name,
  profilePath: member.profile_path,
});
const describeDesign = (product, design) => {
  if (!design) return '';
  return needsCharacter(product) && design.characterName
    ? `${design.characterName} · ${design.movieTitle}`
    : design.movieTitle;
};

// App.js passes `cart`/`onCartChange` so a guest's cart survives signing in
// (this screen unmounts while the sign-in screen is shown).
const StoreScreen = ({ isDark = false, isSignedIn = false, onRequestSignIn, cart: sharedCart, onCartChange }) => {
  const t = glass(isDark);
  const [localCart, setLocalCart] = useState({});
  const cart = sharedCart ?? localCart;
  const setCart = onCartChange ?? setLocalCart;
  const [cartVisible, setCartVisible] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);
  const [receipt, setReceipt] = useState(null);
  // The receipt PDF is generated automatically once payment succeeds.
  const [receiptPdf, setReceiptPdf] = useState(null);
  const [receiptStatus, setReceiptStatus] = useState('idle'); // 'generating' | 'ready' | 'error'
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [orderSaveWarning, setOrderSaveWarning] = useState('');
  const [cartMessage, setCartMessage] = useState('');

  // Trending movies from TMDb supply the art; cast lists supply the characters.
  const [movies, setMovies] = useState([]);
  const [castByMovie, setCastByMovie] = useState({});
  const requestedCast = useRef(new Set());
  const [customizer, setCustomizer] = useState(null); // { product, design }

  useEffect(() => {
    if (!TMDB_API_KEY) return undefined;
    let active = true;
    fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_API_KEY}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && Array.isArray(data?.results)) setMovies(data.results.filter((movie) => movie.poster_path));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const loadCast = useCallback((movieId) => {
    if (!TMDB_API_KEY || requestedCast.current.has(movieId)) return;
    requestedCast.current.add(movieId);
    fetch(`https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${TMDB_API_KEY}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const cast = (data?.cast || [])
          .filter((member) => member.profile_path && member.character)
          .slice(0, CAST_LIMIT);
        setCastByMovie((current) => ({ ...current, [movieId]: cast }));
      })
      .catch(() => setCastByMovie((current) => ({ ...current, [movieId]: [] })));
  }, []);

  // Each product features a different trending movie, and character products
  // feature that movie's top-billed character.
  const featuredDesign = (product, index) => {
    const movie = movies.length ? movies[index % movies.length] : null;
    if (!movie) return null;
    const member = needsCharacter(product) ? castByMovie[movie.id]?.[0] : null;
    return member ? characterDesign(movie, member) : movieDesign(movie);
  };

  useEffect(() => {
    if (!movies.length) return;
    PRODUCTS.forEach((product, index) => {
      if (needsCharacter(product)) loadCast(movies[index % movies.length].id);
    });
  }, [movies, loadCast]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([key, line]) => {
          const product = PRODUCTS.find((candidate) => candidate.id === line.productId);
          if (!product) return null;
          const designLabel = describeDesign(product, line.design);
          return { ...product, key, quantity: line.quantity, design: line.design, designLabel };
        })
        .filter(Boolean),
    [cart]
  );
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Number((subtotal * 0.05).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  const addToCart = (product, design) => {
    const key = lineKeyFor(product.id, design);
    if (!cart[key] && Object.keys(cart).length >= MAX_CART_LINES) {
      setCartMessage(`Your cart can hold ${MAX_CART_LINES} different designs. Check out or remove one first.`);
      return false;
    }
    setCartMessage('');
    setCart((current) => ({
      ...current,
      [key]: {
        productId: product.id,
        design: design || null,
        quantity: Math.min(MAX_QUANTITY_PER_ITEM, (current[key]?.quantity || 0) + 1),
      },
    }));
    return true;
  };

  const changeQuantity = (key, change) => {
    setCart((current) => {
      if (!current[key]) return current;
      const nextQuantity = Math.min(MAX_QUANTITY_PER_ITEM, Math.max(0, current[key].quantity + change));
      const nextCart = { ...current };
      if (nextQuantity === 0) delete nextCart[key];
      else nextCart[key] = { ...current[key], quantity: nextQuantity };
      return nextCart;
    });
  };

  const openCustomizer = (product, design) => {
    if (design?.movieId != null && needsCharacter(product)) loadCast(design.movieId);
    setCustomizer({ product, design });
  };

  const chooseMovie = (movie) => {
    if (needsCharacter(customizer.product)) loadCast(movie.id);
    setCustomizer((current) => ({ ...current, design: movieDesign(movie) }));
  };

  const chooseCharacter = (member) => {
    const movie = movies.find((candidate) => candidate.id === customizer.design?.movieId);
    if (movie) setCustomizer((current) => ({ ...current, design: characterDesign(movie, member) }));
  };

  // After switching movie, pick its first character so the preview is never blank.
  const customizerMovieId = customizer?.design?.movieId;
  const customizerCast = customizerMovieId != null ? castByMovie[customizerMovieId] : undefined;
  useEffect(() => {
    if (!customizer || !needsCharacter(customizer.product) || customizer.design?.characterId || !customizerCast?.length) return;
    const movie = movies.find((candidate) => candidate.id === customizerMovieId);
    if (movie) setCustomizer((current) => ({ ...current, design: characterDesign(movie, customizerCast[0]) }));
  }, [customizer, customizerCast, customizerMovieId, movies]);

  const addCustomDesign = () => {
    if (addToCart(customizer.product, customizer.design)) setCustomizer(null);
  };

  // Floating cart button: drag it anywhere, and it snaps to the nearest side.
  const [stageSize, setStageSize] = useState(null);
  const stageSizeRef = useRef(null);
  const fabPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const fabPlaced = useRef(false);

  const handleStageLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    stageSizeRef.current = { width, height };
    setStageSize({ width, height });
    if (!fabPlaced.current) {
      fabPosition.setValue({ x: width - FAB_WIDTH - FAB_MARGIN, y: height - FAB_HEIGHT - FAB_MARGIN * 2 });
      fabPlaced.current = true;
    }
  };

  const fabPanResponder = useRef(
    PanResponder.create({
      // Only claim the touch once it moves, so a simple tap still opens the cart.
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => fabPosition.extractOffset(),
      onPanResponderMove: Animated.event([null, { dx: fabPosition.x, dy: fabPosition.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => snapFab(),
      onPanResponderTerminate: () => snapFab(),
    })
  ).current;

  function snapFab() {
    fabPosition.flattenOffset();
    fabPosition.stopAnimation(({ x, y }) => {
      const size = stageSizeRef.current;
      if (!size) return;
      const snappedX = x + FAB_WIDTH / 2 < size.width / 2 ? FAB_MARGIN : size.width - FAB_WIDTH - FAB_MARGIN;
      const clampedY = Math.min(Math.max(y, FAB_MARGIN), size.height - FAB_HEIGHT - FAB_MARGIN);
      Animated.spring(fabPosition, { toValue: { x: snappedX, y: clampedY }, friction: 6, useNativeDriver: false }).start();
    });
  }

  const handlePaymentSuccess = async ({ reference, paymentMethod, orderSaved = false }) => {
    const order = {
      id: reference,
      customerEmail: auth?.currentUser?.email || 'Movie fan',
      items: cartItems.map(({ id, name, category, price, quantity, designLabel }) => ({
        id,
        name: designLabel ? `${name} — ${designLabel}` : name,
        category,
        price,
        quantity,
      })),
      subtotal,
      tax,
      total,
      currency: 'USD',
      paymentMethod,
      createdAt: new Date().toLocaleString(),
    };

    let saveWarning = '';
    // Whop orders are already saved by the server; only the other methods save here.
    if (!orderSaved && isFirebaseConfigured && auth?.currentUser) {
      try {
        await withTimeout(
          addDoc(collection(db, 'orders'), {
            userId: auth.currentUser.uid,
            customerEmail: auth.currentUser.email,
            items: order.items,
            subtotal,
            tax,
            total,
            currency: 'USD',
            paymentReference: reference,
            paymentMethod,
            status: 'paid',
            createdAt: serverTimestamp(),
          }),
          ORDER_SAVE_TIMEOUT_MS,
          'The order could not be saved in time.'
        );
      } catch (error) {
        // Shown on the receipt card: an Alert raised while the checkout overlay
        // unmounts is dismissed immediately on Android.
        saveWarning = 'Payment succeeded, but the order could not be saved to your account. Your receipt is still available.';
      }
    }

    // The cart modal stays open and shows the receipt panel; dismissing it and
    // presenting a separate modal at the same moment can fail on iOS.
    setPaymentError('');
    setOrderSaveWarning(saveWarning);
    setReceipt(order);
    setCart({});
    setCheckoutVisible(false);
    generateReceipt(order);
  };

  const generateReceipt = async (order) => {
    setReceiptPdf(null);
    setReceiptMessage('');
    setReceiptStatus('generating');
    try {
      setReceiptPdf(await createReceiptPdf(order));
      setReceiptStatus('ready');
    } catch (error) {
      setReceiptStatus('error');
      setReceiptMessage(error.message || 'Could not create the PDF receipt.');
    }
  };

  const closeReceipt = () => {
    setReceipt(null);
    setReceiptPdf(null);
    setReceiptStatus('idle');
    setReceiptMessage('');
    setOrderSaveWarning('');
    setCartVisible(false);
  };

  const startCheckout = () => {
    if (!isSignedIn) {
      setSignInPromptVisible(true);
      return;
    }
    setPaymentError('');
    setCheckoutVisible(true);
  };

  const requestSignIn = (mode) => {
    setSignInPromptVisible(false);
    setCartVisible(false);
    onRequestSignIn?.(mode);
  };

  const handleCartRequestClose = () => {
    if (signInPromptVisible) setSignInPromptVisible(false);
    else if (checkoutVisible) setCheckoutVisible(false);
    else if (receipt) closeReceipt();
    else setCartVisible(false);
  };

  const handlePaymentFailure = (message) => {
    setPaymentError(message);
  };

  // Messages are shown on the receipt card rather than in an Alert (see saveWarning above).
  const runReceiptAction = async (action) => {
    if (!receiptPdf || receiptBusy) return;
    setReceiptBusy(true);
    setReceiptMessage('');
    try {
      await action();
    } catch (error) {
      if (!isPickerCancelled(error)) setReceiptMessage(error.message || 'Could not access the PDF receipt.');
    } finally {
      setReceiptBusy(false);
    }
  };

  const saveReceipt = () =>
    runReceiptAction(async () => {
      const savedUri = await saveReceiptToDevice(receiptPdf);
      if (savedUri) setReceiptMessage(`Saved ${receiptPdf.fileName} to the selected folder.`);
    });

  const shareReceipt = () => runReceiptAction(() => shareReceiptPdf(receiptPdf));

  const sheetText = { color: t.text };
  const sheetMuted = { color: t.textSecondary };

  return (
    <View style={styles.container} onLayout={handleStageLayout}>
      <FlatList
        data={PRODUCTS}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.productList}
        ListHeaderComponent={
          <View>
            <ScreenHeader
              title="Store"
              subtitle="Merchandise featuring this week's trending movies. Customize any item with the movie or character you love."
            />
            {cartMessage ? <Banner tone="warning" message={cartMessage} style={styles.banner} /> : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const design = featuredDesign(item, index);
          const designLabel = describeDesign(item, design);
          return (
            <View style={[styles.productCard, glassShadow, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={styles.productStage}>
                <View style={styles.spotlight} />
                <MerchArt kind={item.kind} design={design} size={118} />
              </View>
              <View style={styles.productCopy}>
                <Text style={[type.overline, sheetMuted]}>{item.category}</Text>
                <Text style={[type.cardTitle, styles.productName, sheetText]} numberOfLines={1}>{item.name}</Text>
                <Text style={[type.caption, styles.featuring, sheetMuted]} numberOfLines={2}>
                  {designLabel ? `Featuring ${designLabel}` : ' '}
                </Text>
                <Text style={[type.price, styles.price, sheetText]}>{money(item.price)}</Text>
              </View>
              <Button title="Add to cart" size="sm" fullWidth onPress={() => addToCart(item, design)} />
              <Button
                title="Customize"
                variant="secondary"
                size="sm"
                fullWidth
                style={styles.secondaryAction}
                onPress={() => openCustomizer(item, design)}
                accessibilityLabel={`Customize ${item.name}`}
              />
            </View>
          );
        }}
      />

      <Animated.View
        style={[styles.fab, { opacity: stageSize ? 1 : 0, transform: fabPosition.getTranslateTransform() }]}
        {...fabPanResponder.panHandlers}
      >
        <Pressable
          style={({ pressed }) => [styles.fabButton, { backgroundColor: pressed ? t.primaryPressed : t.primary }]}
          onPress={() => setCartVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={`Cart (${itemCount})`}
          accessibilityHint="Opens your cart. Drag to move it."
        >
          <Text style={[type.button, { color: t.onPrimary }]}>Cart</Text>
          {itemCount ? (
            <View style={[styles.fabCount, { backgroundColor: t.onPrimary }]}>
              <Text style={[type.caption, styles.fabCountText, { color: t.primary }]}>{itemCount > 99 ? '99+' : itemCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>

      <Modal visible={Boolean(customizer)} animationType="slide" onRequestClose={() => setCustomizer(null)}>
        <SafeAreaProvider>
          {customizer ? (
            <SafeAreaView style={[styles.modalScreen, { backgroundColor: t.sheet }]}>
              <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
                <Text style={[type.title, styles.modalTitle, sheetText]} numberOfLines={1}>Customize {customizer.product.name}</Text>
                <Button title="Close" variant="ghost" size="sm" onPress={() => setCustomizer(null)} />
              </View>
              <ScrollView contentContainerStyle={styles.customizerContent}>
                <View style={styles.customizerStage}>
                  <View style={[styles.spotlight, styles.bigSpotlight]} />
                  <MerchArt kind={customizer.product.kind} design={customizer.design} size={220} />
                </View>
                <Text style={[type.bodyStrong, styles.customizerLabel, { color: t.link }]}>
                  {describeDesign(customizer.product, customizer.design) || 'Pick a movie to start'}
                </Text>

                <SectionHeading overline="Step 1" title="Choose a movie" style={styles.step} />
                {movies.length ? (
                  <FlatList
                    horizontal
                    data={movies}
                    keyExtractor={(movie) => String(movie.id)}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.movieChoices}
                    renderItem={({ item: movie }) => {
                      const selected = customizer.design?.movieId === movie.id;
                      return (
                        <Pressable
                          style={({ pressed }) => [
                            styles.movieChoice,
                            { borderColor: selected ? t.primary : 'transparent' },
                            pressed && styles.pressed,
                          ]}
                          onPress={() => chooseMovie(movie)}
                          accessibilityRole="button"
                          accessibilityLabel={`Choose ${movie.title}`}
                          accessibilityState={{ selected }}
                        >
                          <Image source={{ uri: posterUrl(movie.poster_path) }} style={[styles.movieChoicePoster, { backgroundColor: t.surfaceRaised }]} />
                          <Text style={[type.caption, styles.movieChoiceTitle, selected ? sheetText : sheetMuted]} numberOfLines={2}>
                            {movie.title}
                          </Text>
                        </Pressable>
                      );
                    }}
                  />
                ) : (
                  <Text style={[type.bodySmall, styles.customizerNote, sheetMuted]}>Movie designs are unavailable right now. Check your connection.</Text>
                )}

                {needsCharacter(customizer.product) && customizer.design ? (
                  <>
                    <SectionHeading overline="Step 2" title="Choose a character" style={styles.step} />
                    {customizerCast === undefined ? (
                      <ActivityIndicator color={t.primary} style={styles.castLoading} />
                    ) : !customizerCast.length ? (
                      <Text style={[type.bodySmall, styles.customizerNote, sheetMuted]}>No character photos for this movie. The poster will be printed instead.</Text>
                    ) : (
                      <View style={styles.castGrid}>
                        {customizerCast.map((member) => {
                          const selected = customizer.design?.characterId === member.id;
                          return (
                            <Pressable
                              key={member.id}
                              style={({ pressed }) => [styles.castChoice, pressed && styles.pressed]}
                              onPress={() => chooseCharacter(member)}
                              accessibilityRole="button"
                              accessibilityLabel={`Choose ${member.character}`}
                              accessibilityState={{ selected }}
                            >
                              <Image
                                source={{ uri: profileUrl(member.profile_path) }}
                                style={[styles.castPhoto, { backgroundColor: t.surfaceRaised, borderColor: selected ? t.primary : 'transparent' }]}
                              />
                              <Text style={[type.caption, styles.castCharacter, sheetText]} numberOfLines={2}>{member.character}</Text>
                              <Text style={[type.caption, styles.castActor, { color: t.textTertiary }]} numberOfLines={1}>{member.name}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </>
                ) : null}
              </ScrollView>
              <View style={[styles.modalFooter, { borderTopColor: t.border }]}>
                {cartMessage ? <Banner tone="warning" message={cartMessage} style={styles.banner} /> : null}
                <Button title={`Add to cart · ${money(customizer.product.price)}`} fullWidth onPress={addCustomDesign} />
              </View>
            </SafeAreaView>
          ) : null}
        </SafeAreaProvider>
      </Modal>

      <Modal visible={cartVisible} animationType="slide" onRequestClose={handleCartRequestClose}>
        {/* A Modal is a separate native window, so it needs its own safe-area provider. */}
        <SafeAreaProvider>
        <View style={[styles.modalRoot, { backgroundColor: t.sheet }]}>
          <SafeAreaView style={styles.modalScreen}>
            <View style={[styles.modalHeader, { borderBottomColor: t.border }]}>
              <Text style={[type.title, styles.modalTitle, sheetText]}>Your cart</Text>
              <Button title="Close" variant="ghost" size="sm" onPress={() => setCartVisible(false)} />
            </View>
            <ScrollView contentContainerStyle={styles.cartContents}>
              {!cartItems.length ? (
                <View style={styles.emptyState}>
                  <Text style={[type.heading, sheetText]}>Your cart is empty.</Text>
                  <Text style={[type.bodySmall, styles.emptyText, sheetMuted]}>Add a shirt, poster or mug featuring your favourite movie.</Text>
                  <Button title="Browse the store" variant="secondary" onPress={() => setCartVisible(false)} />
                </View>
              ) : null}
              {cartItems.map((item) => (
                <View style={[styles.cartItem, { borderBottomColor: t.border }]} key={item.key}>
                  <View style={styles.cartArt}>
                    <MerchArt kind={item.kind} design={item.design} size={52} />
                  </View>
                  <View style={styles.cartItemCopy}>
                    <Text style={[type.bodyStrong, sheetText]} numberOfLines={1}>{item.name}</Text>
                    {item.designLabel ? <Text style={[type.caption, styles.cartItemDesign, sheetMuted]} numberOfLines={2}>{item.designLabel}</Text> : null}
                    <Text style={[type.bodySmall, sheetMuted]}>{money(item.price)} each</Text>
                  </View>
                  <View style={[styles.stepper, { borderColor: t.border }]}>
                    <Pressable
                      style={({ pressed }) => [styles.stepperButton, pressed && { backgroundColor: t.surfaceRaised }]}
                      onPress={() => changeQuantity(item.key, -1)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove one ${item.name}`}
                    >
                      <Text style={[type.heading, sheetText]}>−</Text>
                    </Pressable>
                    <Text style={[type.bodyStrong, styles.quantity, sheetText]}>{item.quantity}</Text>
                    <Pressable
                      style={({ pressed }) => [styles.stepperButton, pressed && { backgroundColor: t.surfaceRaised }]}
                      onPress={() => changeQuantity(item.key, 1)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add one more ${item.name}`}
                    >
                      <Text style={[type.heading, sheetText]}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
            {cartItems.length ? (
              <View style={[styles.modalFooter, { borderTopColor: t.border }]}>
                <SummaryRow label="Subtotal" value={money(subtotal)} />
                <SummaryRow label="Tax (5%)" value={money(tax)} />
                <View style={[styles.totalDivider, { backgroundColor: t.border }]} />
                <SummaryRow label="Total" value={money(total)} emphasis />
                <Button title="Proceed to checkout" fullWidth style={styles.footerAction} onPress={startCheckout} />
              </View>
            ) : null}
          </SafeAreaView>

          {signInPromptVisible ? (
          <View style={[styles.overlay, { backgroundColor: t.scrim }]}>
            <Sheet style={styles.dialog}>
              <Text style={[type.overline, { color: t.link }]}>Almost there</Text>
              <Text style={[type.title, styles.dialogTitle, sheetText]}>Sign in to complete your purchase</Text>
              <Text style={[type.bodySmall, styles.dialogText, sheetMuted]}>
                Your cart is saved: {itemCount} {itemCount === 1 ? 'item' : 'items'}, {money(total)}. Sign in or create a free
                account to check out securely and keep your receipts.
              </Text>
              <Button title="Sign in to checkout" fullWidth onPress={() => requestSignIn('signIn')} />
              <Button
                title="Create a free account"
                variant="secondary"
                fullWidth
                style={styles.dialogAction}
                onPress={() => requestSignIn('register')}
              />
              <Button title="Keep browsing" variant="ghost" fullWidth style={styles.dialogAction} onPress={() => setSignInPromptVisible(false)} />
            </Sheet>
          </View>
          ) : null}

          {checkoutVisible ? (
          <KeyboardAvoidingView
            style={[styles.overlay, { backgroundColor: t.scrim }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Sheet style={styles.checkoutSheet}>
              <View style={styles.dialogHeader}>
                <Text style={[type.title, sheetText]}>Checkout</Text>
                <Button title="Cancel" variant="ghost" size="sm" onPress={() => setCheckoutVisible(false)} />
              </View>
              <View style={[styles.orderSummary, { backgroundColor: t.field, borderColor: t.border }]}>
                <SummaryRow label={`${itemCount} ${itemCount === 1 ? 'item' : 'items'}`} value={money(subtotal)} />
                <SummaryRow label="Tax (5%)" value={money(tax)} />
                <SummaryRow label="Total" value={`${money(total)} USD`} emphasis />
              </View>
              {paymentError ? <Banner tone="error" message={paymentError} style={styles.banner} /> : null}
              <CheckoutPanel
                items={cartItems}
                total={total}
                onSuccess={handlePaymentSuccess}
                onFailure={handlePaymentFailure}
              />
            </Sheet>
          </KeyboardAvoidingView>
          ) : null}

          {receipt ? (
          <View style={[styles.overlay, { backgroundColor: t.scrim }]}>
            <Sheet style={styles.dialog}>
              <Badge label="Paid" tone="success" />
              <Text style={[type.title, styles.dialogTitle, sheetText]}>Payment successful</Text>
              <Text style={[type.bodySmall, sheetMuted]}>Thank you for your order.</Text>
              <View style={[styles.orderSummary, styles.receiptSummary, { backgroundColor: t.field, borderColor: t.border }]}>
                <SummaryRow label="Transaction" value={receipt.id} />
                <SummaryRow label="Paid with" value={receipt.paymentMethod} />
                <SummaryRow label="Total" value={`${money(receipt.total)} USD`} emphasis />
              </View>
              {orderSaveWarning ? <Banner tone="warning" message={orderSaveWarning} style={styles.banner} /> : null}
              {receiptStatus === 'generating' ? (
                <View style={styles.receiptStatusRow}>
                  <ActivityIndicator color={t.primary} />
                  <Text style={[type.bodySmall, styles.receiptStatusText, sheetMuted]}>Creating your PDF receipt…</Text>
                </View>
              ) : null}
              {receiptStatus === 'ready' ? (
                <>
                  <Text style={[type.caption, styles.receiptReady, { color: t.success }]} numberOfLines={1}>
                    PDF receipt ready: {receiptPdf?.fileName}
                  </Text>
                  <Button title="Save PDF to device" fullWidth loading={receiptBusy} onPress={saveReceipt} />
                  <Button title="Share PDF" variant="secondary" fullWidth style={styles.dialogAction} disabled={receiptBusy} onPress={shareReceipt} />
                </>
              ) : null}
              {receiptStatus === 'error' ? (
                <Button title="Try creating the PDF again" fullWidth onPress={() => generateReceipt(receipt)} />
              ) : null}
              {receiptMessage ? <Text style={[type.bodySmall, styles.receiptMessage, sheetMuted]}>{receiptMessage}</Text> : null}
              <Button title="Continue shopping" variant="ghost" fullWidth style={styles.dialogAction} onPress={closeReceipt} />
            </Sheet>
          </View>
          ) : null}
        </View>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
};

// The grid is transparent over App's glass backdrop; sheets and dialogs are opaque
// for readability. Colours, spacing and type come from theme.js.
const styles = StyleSheet.create({
  container: { flex: 1 },
  productList: { paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: 120 },
  productRow: { justifyContent: 'space-between' },
  banner: { marginBottom: space.lg },
  productCard: { width: '48%', borderWidth: 1, borderRadius: radius.lg, padding: space.sm, marginBottom: space.md },
  productStage: { height: 150, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#121827' },
  spotlight: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: '#1D2638' },
  bigSpotlight: { width: 250, height: 250, borderRadius: 125 },
  productCopy: { paddingHorizontal: space.xs, paddingTop: space.md, paddingBottom: space.md },
  productName: { marginTop: space.xs },
  featuring: { marginTop: space.xs, minHeight: 32 },
  price: { marginTop: space.sm },
  secondaryAction: { marginTop: space.sm },
  fab: { position: 'absolute', left: 0, top: 0, width: FAB_WIDTH, height: FAB_HEIGHT },
  fabButton: {
    width: FAB_WIDTH,
    height: FAB_HEIGHT,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  fabCount: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, marginLeft: space.sm, alignItems: 'center', justifyContent: 'center' },
  fabCountText: { fontWeight: '800' },
  modalRoot: { flex: 1 },
  modalScreen: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { flex: 1, marginRight: space.md },
  modalFooter: { paddingHorizontal: GUTTER, paddingTop: space.lg, paddingBottom: space.lg, borderTopWidth: StyleSheet.hairlineWidth },
  footerAction: { marginTop: space.lg },
  customizerContent: { paddingTop: space.lg, paddingBottom: space.xxl },
  customizerStage: { height: 270, marginHorizontal: GUTTER, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#121827' },
  customizerLabel: { textAlign: 'center', marginTop: space.md, marginHorizontal: GUTTER },
  step: { marginTop: space.xxl, marginBottom: space.md, marginHorizontal: GUTTER },
  customizerNote: { marginHorizontal: GUTTER },
  movieChoices: { paddingHorizontal: GUTTER - space.xs },
  movieChoice: { width: 92, marginHorizontal: space.xs, padding: space.xs, borderRadius: radius.md, borderWidth: 2 },
  movieChoicePoster: { width: '100%', aspectRatio: 2 / 3, borderRadius: radius.sm },
  movieChoiceTitle: { marginTop: space.xs },
  pressed: { opacity: 0.7 },
  castLoading: { marginVertical: space.xl },
  castGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - space.xs },
  castChoice: { width: '25%', alignItems: 'center', paddingHorizontal: space.xs, marginBottom: space.lg },
  castPhoto: { width: 64, height: 64, borderRadius: 32, borderWidth: 3 },
  castCharacter: { textAlign: 'center', marginTop: space.xs },
  castActor: { textAlign: 'center', marginTop: space.xxs },
  cartContents: { paddingHorizontal: GUTTER, paddingBottom: space.lg, flexGrow: 1 },
  emptyState: { alignItems: 'center', marginTop: space.xxxl * 2 },
  emptyText: { textAlign: 'center', marginTop: space.sm, marginBottom: space.xl },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  cartArt: { width: 60, height: 60, borderRadius: radius.md, marginRight: space.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#121827' },
  cartItemCopy: { flex: 1, marginRight: space.sm },
  cartItemDesign: { marginVertical: space.xxs },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.pill, overflow: 'hidden' },
  stepperButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  quantity: { minWidth: 24, textAlign: 'center' },
  totalDivider: { height: StyleSheet.hairlineWidth, marginVertical: space.sm },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', padding: space.xl },
  dialog: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  dialogTitle: { marginTop: space.sm },
  dialogText: { marginTop: space.sm, marginBottom: space.xl },
  dialogAction: { marginTop: space.sm },
  checkoutSheet: { width: '100%', maxWidth: 460, alignSelf: 'center', maxHeight: '92%' },
  orderSummary: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.lg },
  receiptSummary: { alignSelf: 'stretch', marginTop: space.lg },
  receiptStatusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  receiptStatusText: { marginLeft: space.sm },
  receiptReady: { marginBottom: space.md },
  receiptMessage: { marginTop: space.sm, textAlign: 'center' },
});

export default StoreScreen;
