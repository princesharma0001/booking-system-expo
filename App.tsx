import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent
} from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { StatusBar } from "expo-status-bar";

const SERVICE_OPTIONS = ["Haircut", "Massage", "Consultation"] as const;
type ServiceType = (typeof SERVICE_OPTIONS)[number];

type Booking = {
  id: string;
  name: string;
  date: string; // ISO string
  service: ServiceType;
};

type FormErrors = {
  name?: string;
  date?: string;
  service?: string;
};

const bookingSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  date: z.date({ required_error: "Date is required" }),
  service: z.enum(SERVICE_OPTIONS, {
    errorMap: () => ({ message: "Service is required" })
  })
});

const STORAGE_KEY = "booking_management_bookings";

export default function App() {
  const [name, setName] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [service, setService] = useState<ServiceType>(SERVICE_OPTIONS[0]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadBookings = async (opts?: { showLoading?: boolean }) => {
    const showLoading = opts?.showLoading ?? true;
    if (showLoading) {
      setIsLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setBookings([]);
      } else {
        const parsed: Booking[] = JSON.parse(stored);
        setBookings(parsed);
      }
    } catch (error) {
      console.error("Failed to load bookings", error);
      Alert.alert("Error", "Could not load bookings. Please try again.");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void loadBookings({ showLoading: true });
  }, []);

  const persistBookings = async (items: Booking[]) => {
    try {
      setIsSyncing(true);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error("Failed to save bookings", error);
      Alert.alert("Error", "Could not save bookings. Please try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  };

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === "dismissed") {
      setShowDatePicker(false);
      return;
    }
    if (date) {
      setSelectedDate(date);
      setErrors((prev) => ({ ...prev, date: undefined }));
    }
    setShowDatePicker(false);
  };

  const handleSubmit = async () => {
    const validation = bookingSchema.safeParse({
      name,
      date: selectedDate ?? undefined,
      service
    });

    if (!validation.success) {
      const fieldErrors: FormErrors = {};
      validation.error.errors.forEach((err) => {
        const field = err.path[0];
        if (typeof field === "string") {
          fieldErrors[field as keyof FormErrors] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    const newBooking: Booking = {
      id: Date.now().toString(),
      name: validation.data.name.trim(),
      date: validation.data.date.toISOString(),
      service: validation.data.service
    };

    const updatedBookings = [newBooking, ...bookings];
    setBookings(updatedBookings);
    await persistBookings(updatedBookings);

    // Reset form after successful submission
    setName("");
    setSelectedDate(null);
    setService(SERVICE_OPTIONS[0]);
    setErrors({});
  };

  const handleDelete = async (id: string) => {
    const filtered = bookings.filter((booking) => booking.id !== id);
    setBookings(filtered);
    await persistBookings(filtered);
  };

  const filteredBookings = bookings.filter((booking) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      booking.name.toLowerCase().includes(q) ||
      booking.service.toLowerCase().includes(q)
    );
  });

  const renderBooking = ({ item }: { item: Booking }) => (
    <View style={styles.bookingCard}>
      <View style={styles.bookingTextGroup}>
        <Text style={styles.bookingName}>{item.name}</Text>
        <Text style={styles.bookingMeta}>
          {formatDate(item.date)} • {item.service}
        </Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.deleteButton}
        onPress={() => handleDelete(item.id)}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void loadBookings({ showLoading: false });
              }}
            />
          }
        >
          <Text style={styles.title}>Booking Management</Text>

          <View style={styles.counterRow}>
            <Text style={styles.counterText}>
              Total Bookings: {bookings.length}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="Enter name"
              style={[
                styles.input,
                errors.name ? styles.inputError : undefined
              ]}
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

            <Text style={styles.label}>Booking Date</Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.dateButton,
                errors.date ? styles.inputError : undefined
              ]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {selectedDate
                  ? formatDate(selectedDate.toISOString())
                  : "Select a date"}
              </Text>
            </TouchableOpacity>
            {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}

            <Text style={styles.label}>Service</Text>
            <View style={styles.serviceOptions}>
              {SERVICE_OPTIONS.map((option) => {
                const selected = option === service;
                return (
                  <TouchableOpacity
                    key={option}
                    accessibilityRole="button"
                    onPress={() => {
                      setService(option);
                      setErrors((prev) => ({ ...prev, service: undefined }));
                    }}
                    style={[
                      styles.serviceChip,
                      selected ? styles.serviceChipSelected : undefined
                    ]}
                  >
                    <Text
                      style={[
                        styles.serviceChipText,
                        selected ? styles.serviceChipTextSelected : undefined
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.service && (
              <Text style={styles.errorText}>{errors.service}</Text>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              style={[
                styles.submitButton,
                isSyncing ? styles.submitButtonDisabled : undefined
              ]}
              onPress={handleSubmit}
              disabled={isSyncing}
            >
              <Text style={styles.submitButtonText}>
                {isSyncing ? "Saving..." : "Save Booking"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Bookings</Text>

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name or service"
            style={styles.searchInput}
          />

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.loadingText}>Loading bookings...</Text>
            </View>
          ) : filteredBookings.length === 0 ? (
            <Text style={styles.emptyText}>No bookings to display.</Text>
          ) : (
            <FlatList
              data={filteredBookings}
              keyExtractor={(item) => item.id}
              renderItem={renderBooking}
              scrollEnabled={false}
              contentContainerStyle={styles.listContent}
            />
          )}
        </ScrollView>
        {showDatePicker && (
          <DateTimePicker
            value={selectedDate ?? new Date()}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f7"
  },
  container: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 20,
    color: "#1f2937"
  },
  counterRow: {
    marginBottom: 12
  },
  counterText: {
    fontSize: 14,
    color: "#4b5563",
    fontWeight: "500"
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginTop: 8
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    fontSize: 16
  },
  inputError: {
    borderColor: "#f87171"
  },
  dateButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 8
  },
  dateButtonText: {
    fontSize: 16,
    color: "#111827"
  },
  serviceOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8
  },
  serviceChip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16
  },
  serviceChipSelected: {
    backgroundColor: "#2563eb",
    borderColor: "#1d4ed8"
  },
  serviceChipText: {
    color: "#111827",
    fontSize: 14
  },
  serviceChipTextSelected: {
    color: "#ffffff",
    fontWeight: "700"
  },
  submitButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
    alignItems: "center"
  },
  submitButtonDisabled: {
    opacity: 0.7
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 8,
    color: "#1f2937"
  },
  listContent: {
    gap: 10
  },
  bookingCard: {
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2
  },
  bookingTextGroup: {
    flex: 1,
    paddingRight: 8
  },
  bookingName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827"
  },
  bookingMeta: {
    fontSize: 14,
    color: "#4b5563",
    marginTop: 2
  },
  deleteButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  deleteButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 15,
    marginTop: 8
  },
  errorText: {
    color: "#dc2626",
    marginTop: 4,
    fontSize: 13
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    marginBottom: 12
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#4b5563"
  }
});

