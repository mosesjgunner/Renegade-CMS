SELECT jsonb_pretty(jsonb_build_object(
  'orders', (SELECT jsonb_agg(jsonb_build_object('id',o.id,'state',o.state,'amountMinor',o.amount_minor,'currency',o.currency,'site',o.site_id,'merchant',o.merchant_connection_id,'checkoutSession',o.checkout_session_id,'receipt',o.receipt,'items',o.items,'fulfillment',o.fulfillment_extension) ORDER BY o.created_at) FROM orders o),
  'podJobs', (SELECT jsonb_agg(jsonb_build_object('id',j.id,'order',j.order_id,'site',j.site_id,'connection',j.connection_id,'packageIndex',j.package_index,'state',j.state,'externalOrderId',j.external_order_id,'attemptCount',j.attempt_count,'cost',j.cost_snapshot,'audit',j.audit_trail) ORDER BY j.created_at) FROM pod_jobs j),
  'manualPackages', (SELECT jsonb_agg(jsonb_build_object('id',m.id,'order',m.order_id,'site',m.site_id,'packageIndex',m.package_index,'status',m.status,'source',m.source,'lines',m.approved_lines,'audit',m.audit_trail) ORDER BY m.created_at) FROM manual_fulfillment_packages m),
  'callbacks', (SELECT jsonb_agg(jsonb_build_object('id',e.id,'providerEventId',e.provider_event_id,'processingState',e.processing_state) ORDER BY e.created_at) FROM payment_webhook_events e),
  'paymentIntents', (SELECT jsonb_agg(jsonb_build_object('id',p.id,'state',p.state,'site',p.site_id,'merchant',p.merchant_connection_id,'checkoutSession',p.checkout_session_id,'amountMinor',p.amount_minor,'currency',p.currency,'financialEvents',p.financial_events) ORDER BY p.created_at) FROM payment_intents p),
  'connections', (SELECT jsonb_agg(jsonb_build_object('id',c.id,'site',c.site_id,'merchant',c.merchant_connection_id,'provider',c.provider_key,'status',c.status)) FROM pod_connections c)
));

