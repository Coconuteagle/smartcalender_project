import React, { useEffect, useRef, useState } from 'react';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';
import { v4 as uuidv4 } from 'uuid';

const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY || "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";

// Awaited<T>를 사용하여 Promise가 resolve하는 타입을 추출합니다.
// ReturnType<T>을 사용하여 함수의 반환 타입을 추출합니다.
type TossPaymentsInstance = Awaited<ReturnType<typeof loadTossPayments>>;
type Widgets = ReturnType<TossPaymentsInstance['widgets']>;

const Payment: React.FC = () => {
  const [widgets, setWidgets] = useState<Widgets | null>(null);
  const paymentMethodsRef = useRef<HTMLDivElement>(null);
  const agreementRef = useRef<HTMLDivElement>(null);
  const [price, setPrice] = useState(50000);

  useEffect(() => {
    const initializeWidgets = async () => {
      try {
        const tossPayments = await loadTossPayments(clientKey);
        const paymentWidgets = tossPayments.widgets({ customerKey: uuidv4() });
        setWidgets(paymentWidgets);
      } catch (error) {
        console.error("Toss Payments 위젯 초기화 실패:", error);
      }
    };

    initializeWidgets();
  }, []);

  useEffect(() => {
    if (widgets && paymentMethodsRef.current && agreementRef.current) {
      const renderWidgets = async () => {
        try {
          await widgets.setAmount({
            currency: "KRW",
            value: price,
          });

          await widgets.renderPaymentMethods({
            selector: "#payment-methods",
            variantKey: "DEFAULT",
          });

          await widgets.renderAgreement({
            selector: "#agreement",
            variantKey: "AGREEMENT"
          });
        } catch (error) {
          console.error("Toss Payments 위젯 렌더링 실패:", error);
        }
      };
      renderWidgets();
    }
  }, [widgets, price]);

  const handlePayment = async () => {
    if (!widgets) {
      alert("결제 위젯이 로드되지 않았습니다.");
      return;
    }

    try {
      await widgets.requestPayment({
        orderId: uuidv4(),
        orderName: "스마트캘린더 AI 이용권",
        successUrl: `${window.location.origin}/success`,
        failUrl: `${window.location.origin}/fail`,
        customerName: "김토스",
        customerEmail: "customer123@gmail.com",
      });
    } catch (error) {
      console.error("결제 요청 실패:", error);
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">주문서</h2>
      <div className="border p-6 rounded-lg shadow-md bg-white">
        <div className="mb-6">
          <p className="text-lg font-semibold">스마트캘린더 AI 기능 1개월 이용권</p>
          <p className="text-3xl font-bold my-2">{price.toLocaleString()}원</p>
        </div>

        <div id="payment-methods" ref={paymentMethodsRef} className="mb-4" />
        <div id="agreement" ref={agreementRef} className="mb-6" />

        <button
          onClick={handlePayment}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg text-lg"
        >
          결제하기
        </button>
      </div>
    </div>
  );
};

export default Payment;
