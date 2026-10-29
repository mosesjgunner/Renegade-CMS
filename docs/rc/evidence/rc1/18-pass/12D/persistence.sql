-- Read-only receipt for the explicitly disposable rc112d_release_acceptance database.
SELECT jsonb_pretty(jsonb_build_object(
  'orders',(SELECT jsonb_agg(jsonb_build_object('id',id,'site',site_id,'session',checkout_session_id,'number',order_number,'state',state,'currency',currency,'amountMinor',amount_minor,'attribution',referral_attribution,'refund',refund_extension,'source',source_snapshot) ORDER BY created_at) FROM orders),
  'commissions',(SELECT jsonb_agg(jsonb_build_object('id',id,'site',site_id,'order',order_id,'type',type,'status',status,'currency',currency,'amountMinor',amount_minor,'reversedMinor',reversed_amount_minor,'compensates',compensates_ledger_id,'eventKey',event_key) ORDER BY created_at) FROM commission_ledgers),
  'callbacks',(SELECT jsonb_agg(jsonb_build_object('eventId',external_event_id,'order',external_order_id,'status',status,'reconciliation',reconciliation_state,'hash',raw_payload_hash) ORDER BY created_at) FROM affiliate_conversions),
  'donations',(SELECT jsonb_agg(jsonb_build_object('id',id,'site',site_id,'paymentIntent',payment_intent_id,'lifecycle',lifecycle,'baseAmountMinor',base_amount_minor,'feeMinor',fee_covered_amount_minor,'currency',currency) ORDER BY created_at) FROM donations),
  'subscriptionEvents',(SELECT jsonb_agg(jsonb_build_object('id',id,'subscription',subscription_id,'kind',kind,'evidence',evidence) ORDER BY created_at) FROM subscription_events),
  'paymentEvents',(SELECT jsonb_agg(jsonb_build_object('id',id,'site',site_id,'state',state,'amountMinor',amount_minor,'currency',currency,'financialEvents',financial_events) ORDER BY created_at) FROM payment_intents),
  'refunds',(SELECT jsonb_agg(jsonb_build_object('id',id,'order',order_id,'state',state,'amountMinor',amount_minor,'currency',currency,'providerEvidence',provider_evidence) ORDER BY created_at) FROM commerce_refunds),
  'settlementBatchCount',(SELECT count(*) FROM settlement_batches),
  'persistedClickCount',(SELECT count(*) FROM affiliate_clicks),
  'migrationCount',(SELECT count(*) FROM payload_migrations)
));
