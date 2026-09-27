package app.fintrack.ai;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStoreException;

import javax.crypto.AEADBadTagException;

import org.junit.Test;

public class WidgetStoreTest {

    @Test
    public void decryptTagFailureIsCorruption() {
        assertTrue(WidgetStore.isCorruption(new AEADBadTagException("tag mismatch")));
        // EncryptedSharedPreferences wraps it in a SecurityException.
        assertTrue(WidgetStore.isCorruption(
            new SecurityException("Could not decrypt value", new AEADBadTagException("tag mismatch"))));
    }

    @Test
    public void keystoreFailureIsCorruption() {
        assertTrue(WidgetStore.isCorruption(
            new GeneralSecurityException("keyset", new KeyStoreException("no key"))));
    }

    @Test
    public void otherErrorsAreNotCorruption() {
        assertFalse(WidgetStore.isCorruption(new IOException("disk busy")));
        assertFalse(WidgetStore.isCorruption(new GeneralSecurityException("transient")));
        assertFalse(WidgetStore.isCorruption(new IllegalStateException("x", new RuntimeException("y"))));
        assertFalse(WidgetStore.isCorruption(null));
    }
}
