/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * RC3-CE service & event bookings (CE-02, contract §3 R4).
 *
 * Seat capacity is authoritative on service_slots.booked_count and is
 * only ever mutated inside a transaction with a conditional UPDATE:
 * the increment lands only while capacity remains, so two concurrent
 * checkouts can never oversell a slot (CE-T05). Bookings ride the
 * canonical Commerce order for payment — this module owns the seat,
 * Commerce owns the money.
 */

function poolOf(db: any): any {
  const pool = db.db?.pool ?? db.pool
  if (!pool) throw new Error('Database pool unavailable for service bookings.')
  return pool
}

export async function createSlot(
  db: any,
  siteId: string,
  data: {
    product: string
    startsAt?: string | null
    endsAt?: string | null
    timezone?: string | null
    capacity: number
  },
): Promise<any> {
  if (!Number.isInteger(data.capacity) || data.capacity < 0)
    throw new Error('Slot capacity must be a non-negative integer.')
  return db.create({
    collection: 'service-slots',
    data: { ...data, site: siteId, bookedCount: 0, status: 'open' },
    depth: 0,
    overrideAccess: true,
  })
}

/**
 * Atomically reserve seats and create the booking. Returns the
 * booking row id. Throws a capacity error — creating nothing — when
 * the slot cannot hold the request.
 */
export async function reserveSeats(
  db: any,
  siteId: string,
  input: {
    slotId: string
    productId: string
    seats: number
    buyerName?: string | null
    buyerEmail?: string | null
    orderId?: string | null
  },
): Promise<{ bookingId: string; bookedCount: number }> {
  if (!Number.isInteger(input.seats) || input.seats <= 0)
    throw new Error('Seats must be a positive integer.')
  const pool = poolOf(db)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const updated = await client.query(
      `UPDATE service_slots
          SET booked_count = booked_count + $1, updated_at = now()
        WHERE id = $2 AND site_id = $3 AND status = 'open'
          AND capacity IS NOT NULL AND booked_count + $1 <= capacity
        RETURNING booked_count`,
      [input.seats, input.slotId, siteId],
    )
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('Slot does not have enough remaining capacity for this booking.')
    }
    const inserted = await client.query(
      `INSERT INTO service_bookings
         (site_id, slot_id, product_id, order_id, buyer_name, buyer_email, seats, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'reserved')
       RETURNING id`,
      [
        siteId,
        input.slotId,
        input.productId,
        input.orderId ?? null,
        input.buyerName ?? null,
        input.buyerEmail ?? null,
        input.seats,
      ],
    )
    await client.query('COMMIT')
    return {
      bookingId: String(inserted.rows[0].id),
      bookedCount: Number(updated.rows[0].booked_count),
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // already rolled back above
    }
    throw error
  } finally {
    client.release()
  }
}

/** Cancel a booking and release its seats in the same transaction. */
export async function cancelServiceBooking(
  db: any,
  siteId: string,
  bookingId: string,
): Promise<void> {
  const pool = poolOf(db)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const booking = await client.query(
      `UPDATE service_bookings SET state = 'cancelled', updated_at = now()
        WHERE id = $1 AND site_id = $2 AND state IN ('reserved', 'confirmed')
        RETURNING slot_id, seats`,
      [bookingId, siteId],
    )
    if (booking.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('Booking not found or not cancellable.')
    }
    await client.query(
      `UPDATE service_slots
          SET booked_count = GREATEST(booked_count - $1, 0), updated_at = now()
        WHERE id = $2 AND site_id = $3`,
      [Number(booking.rows[0].seats), booking.rows[0].slot_id, siteId],
    )
    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // already rolled back above
    }
    throw error
  } finally {
    client.release()
  }
}
